import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image, Modal, Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import MapMarkerPin from '../../components/MapMarkerPin';
import { useAuth }        from '../../context/AuthContext';
import { logout }         from '../../services/authService';
import { supabase }       from '../../config/supabase';
import { requestLocationPermission, getCurrentLocation, formatDistance } from '../../services/locationService';
import {
  setDriverReady, setDriverNotReady, incrementDriverRefusals,
  acceptRideJob, acceptDeliveryJob, getDriverAverageRating, getDeliveryJob,
  dispatchJob,
} from '../../services/jobService';
import { registerForPushNotifications, setupNotificationListeners, consumePendingJobOffer } from '../../services/notificationService';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showPlayable } from '../../services/adService';
import { isNoAdsActive } from '../../services/subscriptionService';
import AdMessageOverlay from '../../components/AdMessageOverlay';
import AnimatedPressButton from '../../components/AnimatedPressButton';

const OFFER_TIMEOUT = 15;

export default function DriverHomeScreen({ navigation }) {
  const { colors } = useThemeColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { account }                 = useAuth();
  const [subscribed,  setSubscribed]  = useState(true); // assume subscribed until checked
  const [status,      setStatus]      = useState('idle');  // idle | loading | waiting
  const [location,    setLocation]    = useState(null);
  const [jobOffer,    setJobOffer]    = useState(null);
  const [offerTimer,  setOfferTimer]  = useState(0);
  const [showAdMsg,   setShowAdMsg]   = useState(false);
  const [avgRating,    setAvgRating]    = useState(null);
  const [ratingCount,  setRatingCount]  = useState(0);
  const [strikes,         setStrikes]         = useState(0);
  const [cooldownDisplay, setCooldownDisplay] = useState(''); // '' = button available
  const [relocating,      setRelocating]      = useState(false);
  const timerRef        = useRef(null);
  const adResolveRef    = useRef(null);
  const offerHandledRef = useRef(false);
  const cooldownRef     = useRef(null);

  useEffect(() => {
    offerHandledRef.current = false;
    if (account?.id) {
      registerForPushNotifications(account.id).catch(e =>
        console.warn('[DriverHome] registerForPushNotifications failed:', e)
      );
      checkActiveJob();
    }
    isNoAdsActive().then(active => setSubscribed(active)).catch(() => {});
    getDriverAverageRating(account.id).then(({ average, count }) => {
      if (average !== null) { setAvgRating(average); setRatingCount(count); }
    }).catch(() => {});
    supabase.from('driver_profiles').select('consecutive_refusals').eq('id', account.id).single()
      .then(({ data }) => { if (data) setStrikes(data.consecutive_refusals ?? 0); })
      .catch(() => {});

    const cleanup = setupNotificationListeners({
      onJobOffer: (data) => {
        if (data?.type === 'delivery_assigned') {
          handleJobAssigned(data);
          return;
        }
        if (offerHandledRef.current) return;
        offerHandledRef.current = true;
        handleJobOffer(data);
      },
    });

    // consumePendingJobOffer handles cold-launch taps (response listener
    // may not fire in time). The ref prevents double-handling.
    consumePendingJobOffer().then(data => {
      if (!data) return;
      if (data.type === 'delivery_assigned') {
        handleJobAssigned(data);
        return;
      }
      if (!offerHandledRef.current) {
        offerHandledRef.current = true;
        handleJobOffer(data);
      }
    }).catch(e => console.warn('[DriverHome] consumePendingJobOffer failed:', e));

    return () => {
      cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [account?.id]);

  // ── Resume active job on app open ────────────────────────────
  // Handles: push not received, app closed mid-job, simulator testing

  async function checkActiveJob() {
    // 1. Active ride → go straight to ride screen
    const { data: ride } = await supabase
      .from('ride_jobs')
      .select('*')
      .eq('driver_id', account.id)
      .in('status', ['accepted', 'in_progress'])
      .maybeSingle();

    if (ride) {
      await requestLocationPermission();
      navigation.navigate('DriverRide', { job: ride });
      return;
    }

    // 2. Active delivery → go straight to delivery screen
    // Include 'delivered' where driver hasn't completed yet (returned to store)
    const { data: delivery } = await supabase
      .from('delivery_jobs')
      .select('*')
      .eq('driver_id', account.id)
      .in('status', ['out_for_delivery', 'delivered'])
      .eq('driver_complete', false)
      .maybeSingle();

    if (delivery) {
      await requestLocationPermission();
      navigation.navigate('DriverDelivery', { job: delivery });
      return;
    }

    // 3. No active job — check if driver is already marked ready in DB.
    // This happens when returning from a completed job: ready_for_rides stays
    // true so the driver re-enters the waiting pool without watching a second ad.
    const { data: profile } = await supabase
      .from('driver_profiles')
      .select('ready_for_rides, last_known_lat, last_known_lng')
      .eq('id', account.id)
      .single();

    if (profile?.ready_for_rides) {
      if (profile.last_known_lat && profile.last_known_lng) {
        setLocation({ lat: profile.last_known_lat, lng: profile.last_known_lng });
      }
      setStatus('waiting');
      // Silently refresh location after returning from a completed job — driver may have moved.
      // Start cooldown because location was just auto-updated; no need to manually update yet.
      getCurrentLocation().then(loc => {
        if (!loc) return;
        setLocation(loc);
        supabase.from('driver_profiles').update({
          last_known_lat: loc.lat,
          last_known_lng: loc.lng,
          location_updated_at: new Date().toISOString(),
        }).eq('id', account.id).then(() => {});
        startCooldown();
      }).catch(() => {});
    }
  }

  function startCooldown() {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    const endsAt = Date.now() + 30 * 60 * 1000;
    const tick = () => {
      const rem = endsAt - Date.now();
      if (rem <= 0) {
        clearInterval(cooldownRef.current);
        setCooldownDisplay('');
      } else {
        const m = Math.floor(rem / 60000);
        const s = Math.floor((rem % 60000) / 1000);
        setCooldownDisplay(`${m}:${s.toString().padStart(2, '0')}`);
      }
    };
    tick();
    cooldownRef.current = setInterval(tick, 1000);
  }

  function clearCooldown() {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldownDisplay('');
  }

  function renderRatingBadge() {
    if (avgRating === null) return null;
    return (
      <Text style={s.ratingBadge}>★ {avgRating.toFixed(1)}  ·  {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}</Text>
    );
  }

  // ── Store-assigned delivery — skip offer card, auto-navigate ─

  async function handleJobAssigned(data) {
    if (!data?.job_id) return;
    const { data: job, error } = await getDeliveryJob(data.job_id);
    if (error || !job) {
      Alert.alert(t('shared.error'), t('driverHome.jobTaken'));
      return;
    }
    setStrikes(0);
    supabase.from('driver_profiles').update({ consecutive_refusals: 0 }).eq('id', account.id).then(() => {});
    await requestLocationPermission();
    navigation.navigate('DriverDelivery', { job });
  }

  // ── Job offer ────────────────────────────────────────────────

  async function handleJobOffer(data) {
    try {
      if (!data?.type || !data?.job_id) {
        console.warn('handleJobOffer: invalid payload', JSON.stringify(data));
        return;
      }
      // Validate the job still exists and is pending — cached notifications can
      // carry stale job IDs from previous sessions or cancelled test jobs.
      const table = data.type === 'ride_offer' ? 'ride_jobs' : 'delivery_jobs';
      const { data: job } = await supabase.from(table).select('status').eq('id', data.job_id).maybeSingle();
      if (!job || job.status !== 'pending') {
        console.warn('handleJobOffer: job no longer pending, ignoring stale offer', data.job_id);
        offerHandledRef.current = false; // allow the next real offer through
        return;
      }
      Vibration.vibrate([0, 400, 150, 400, 150, 400]);
      if (timerRef.current) clearInterval(timerRef.current);
      setJobOffer(data);
      let countdown = OFFER_TIMEOUT;
      setOfferTimer(countdown);
      timerRef.current = setInterval(() => {
        countdown -= 1;
        setOfferTimer(countdown);
        if (countdown <= 0) {
          clearInterval(timerRef.current);
          handleRefuse(data);
        }
      }, 1000);
    } catch (e) {
      console.error('handleJobOffer error:', e);
    }
  }

  async function handleRefuse(offer) {
    clearInterval(timerRef.current);
    setJobOffer(null);
    offerHandledRef.current = false;
    const { limitReached } = await incrementDriverRefusals(account.id).catch(() => ({ limitReached: false }));
    setStrikes(prev => Math.min(prev + 1, 3));
    if (limitReached) {
      Alert.alert(t('driverHome.markedUnavailable'), t('driverHome.refusedTooMany'));
      setStatus('idle');
      setStrikes(0);
    }
    // Re-dispatch to next driver — carry forward all previously excluded drivers
    if (offer?.job_id && offer?.type) {
      const jobType = offer.type === 'ride_offer' ? 'ride' : 'delivery';
      const driverId = account?.id;
      const prior = Array.isArray(offer.excluded_driver_ids) ? offer.excluded_driver_ids : [];
      const excluded = driverId ? [...prior, driverId] : prior;
      console.log('[dispatch] re-dispatching', jobType, offer.job_id, 'excluding', excluded);
      dispatchJob(offer.job_id, jobType, excluded)
        .then(({ error }) => { if (error) console.error('[dispatch] re-dispatch error:', error); })
        .catch(e => console.error('[dispatch] re-dispatch threw:', e));
    }
  }

  async function handleAccept() {
    if (!jobOffer) return;
    // Capture before any state changes or awaits
    const offer = jobOffer;
    clearInterval(timerRef.current);
    setJobOffer(null);
    offerHandledRef.current = false;
    setStrikes(0);
    supabase.from('driver_profiles').update({ consecutive_refusals: 0 }).eq('id', account.id).then(() => {});
    const loc = await getCurrentLocation();
    const args = { jobId: offer.job_id, driverId: account.id, driverLat: loc?.lat, driverLng: loc?.lng };
    if (offer.type === 'ride_offer') {
      const { data, error } = await acceptRideJob(args);
      if (!error && data) {
        // Mark not ready so dispatch skips this driver while they're on a job
        supabase.from('driver_profiles').update({ ready_for_rides: false }).eq('id', account.id).then(() => {});
        navigation.navigate('DriverRide', { job: data });
      } else {
        Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
      }
    } else {
      const { data, error } = await acceptDeliveryJob(args);
      if (!error && data) {
        supabase.from('driver_profiles').update({ ready_for_rides: false }).eq('id', account.id).then(() => {});
        navigation.navigate('DriverDelivery', { job: data });
      } else {
        Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
      }
    }
  }

  // ── Status actions ───────────────────────────────────────────

  async function handleMarkReady() {
    setStatus('loading');
    if (!(await requestLocationPermission())) {
      Alert.alert(t('shared.locationRequired'), t('driverHome.locationRequiredMsg'));
      setStatus('idle');
      return;
    }
    const loc = await getCurrentLocation();
    if (!loc) {
      Alert.alert(t('shared.locationError'), t('shared.locationErrorMsg'));
      setStatus('idle');
      return;
    }
    setLocation(loc);
    await new Promise(resolve => { adResolveRef.current = resolve; setShowAdMsg(true); });
    await showPlayable();
    const { error } = await setDriverReady(account.id, loc.lat, loc.lng);
    if (error) { Alert.alert(t('shared.error'), t('driverHome.statusUpdateError')); setStatus('idle'); return; }
    setStrikes(0);
    setStatus('waiting');
  }

  async function handleGoOffline() {
    clearCooldown();
    await setDriverNotReady(account.id);
    setStatus('idle');
    setLocation(null);
  }

  async function handleRelocate() {
    if (relocating) return;
    setRelocating(true);
    const loc = await getCurrentLocation().catch(() => null);
    if (loc) {
      setLocation(loc);
      await supabase.from('driver_profiles').update({
        last_known_lat: loc.lat,
        last_known_lng: loc.lng,
        location_updated_at: new Date().toISOString(),
      }).eq('id', account.id);
    }
    setRelocating(false);
    startCooldown();
  }

  async function handleSignOut() {
    await setDriverNotReady(account.id);
    logout();
  }

  // ── Hero status copy ─────────────────────────────────────────

  function renderStrikes() {
    return (
      <View style={s.strikesRow}>
        {[0, 1, 2].map(i => {
          const hit = i < strikes;
          return (
            <View key={i} style={[s.strikeCircle, hit && s.strikeCircleHit]}>
              {hit && <Text style={s.strikeX}>✕</Text>}
            </View>
          );
        })}
      </View>
    );
  }

  function renderHeroStatus() {
    if (status === 'loading') {
      return (
        <View style={s.heroStatusRow}>
          <ActivityIndicator size="small" />
          <Text style={s.heroMuted}>{t('driverHome.gettingLocation').toUpperCase()}</Text>
        </View>
      );
    }
    if (status === 'waiting') {
      return (
        <View style={s.heroStatusRow}>
          <View style={s.onlineDot} />
          <Text style={s.heroOnline}>ONLINE</Text>
          <View style={s.heroStatusSpacer} />
          {renderStrikes()}
        </View>
      );
    }
    return <Text style={s.heroOffline}>{t('driverHome.offline').toUpperCase()}</Text>;
  }

  // ── Job offer card ───────────────────────────────────────────

  function renderJobOffer() {
    return (
      <Modal
        visible={!!jobOffer}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <View style={s.offerModalBackdrop}>
          <View style={s.offerCard}>
            <View style={s.offerTopRow}>
              <Text style={s.offerType}>
                {jobOffer?.type === 'ride_offer'
                  ? t('driverHome.rideOffer')
                  : t('driverHome.deliveryOffer')}
              </Text>
              <Text style={s.offerTimerText}>{offerTimer}s</Text>
            </View>
            <Text style={s.offerDistance}>
              {t('driverHome.kmAway', { distance: jobOffer?.distance != null ? formatDistance(parseFloat(jobOffer.distance)) : '?' })}
            </Text>
            <View style={s.offerBtns}>
              <AnimatedPressButton style={s.declineBtn} onPress={() => handleRefuse(jobOffer)}>
                <Text style={s.declineBtnText}>{t('driverHome.decline').toUpperCase()}</Text>
              </AnimatedPressButton>
              <AnimatedPressButton style={s.acceptBtn} onPress={handleAccept}>
                <Text style={s.acceptBtnText}>{t('driverHome.accept').toUpperCase()}</Text>
              </AnimatedPressButton>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  // ── Render ───────────────────────────────────────────────────

  const DRIVER_AD_MESSAGES = [
    t('adMessage.driverReady'),
    t('adMessage.keepFree'),
    t('adMessage.goAdFree'),
  ];

  return (
    <View style={s.root}>

      {renderJobOffer()}

      <AdMessageOverlay
        visible={showAdMsg}
        messages={DRIVER_AD_MESSAGES}
        onDone={() => { setShowAdMsg(false); adResolveRef.current?.(); }}
        navigation={navigation}
      />

      {/* ── Hero panel ── */}
      <SafeAreaView style={s.hero} edges={['top']}>

        {/* Header rows */}
        <Image source={require('../../../assets/app-logoV2.png')} style={s.headerLogo} resizeMode="contain" />
        <View style={s.heroActions}>
          <TouchableOpacity
            style={s.heroBtn}
            onPress={() => navigation.navigate('DriverStats')}
          >
            <Text style={s.heroBtnText}>{t('driverHome.stats').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.heroBtn}
            onPress={() => navigation.navigate('Instructions')}
          >
            <Text style={s.heroBtnText}>{t('driverHome.help').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.heroBtn}
            onPress={() => navigation.navigate('Account')}
          >
            <Text style={s.heroBtnText}>{t('account.title').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.heroBtn, s.heroBtnRed]} onPress={handleSignOut}>
            <Text style={[s.heroBtnText, s.heroBtnRedText]}>
              {t('auth.signOut').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Status */}
        <View style={s.heroStatus}>
          {renderHeroStatus()}
          {renderRatingBadge()}
        </View>

      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {/* ── Map area ── */}
      <View style={s.mapArea}>
        {location ? (
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={{
              latitude: location.lat, longitude: location.lng,
              latitudeDelta: 0.015,   longitudeDelta: 0.015,
            }}
          >
            <Marker
              coordinate={{ latitude: location.lat, longitude: location.lng }}
              anchor={{ x: 0.5, y: 1 }}
            >
              <MapMarkerPin emoji="🏍️" />
            </Marker>
          </MapView>
        ) : (
          <View style={s.mapPlaceholder}>
            <Image
              source={require('../../../assets/logo.png')}
              style={s.placeholderLogo}
              resizeMode="contain"
            />
            <Text style={s.mapPlaceholderText}>
              {t('driverHome.markReadyFirst').toUpperCase()}
            </Text>
          </View>
        )}

      </View>

      {/* ── Footer action ── */}
      <SafeAreaView style={s.footer} edges={['bottom']}>
        {status === 'idle' && (
          <AnimatedPressButton style={s.primaryBtn} onPress={handleMarkReady}>
            <Text style={s.primaryBtnText}>{t('driverHome.markReady').toUpperCase()}</Text>
          </AnimatedPressButton>
        )}
        {status === 'waiting' && (
          <>
            <AnimatedPressButton style={s.secondaryBtn} onPress={handleGoOffline}>
              <Text style={s.secondaryBtnText}>{t('driverHome.goOffline').toUpperCase()}</Text>
            </AnimatedPressButton>
            {cooldownDisplay ? (
              <View style={s.relocateCooldown}>
                <Text style={s.relocateCooldownText}>
                  {t('driverHome.locationUpdateIn', { time: cooldownDisplay })}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={s.relocateLink}
                onPress={handleRelocate}
                disabled={relocating}
              >
                <Text style={s.relocateLinkText}>
                  {relocating
                    ? t('driverHome.relocating')
                    : t('driverHome.relocate')}
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {status === 'loading' && (
          <View style={[s.primaryBtn, { opacity: 0.5 }]}>
            <ActivityIndicator color={colors.onDark} />
          </View>
        )}
      </SafeAreaView>

      {/* Go Ad Free footer */}
      {!subscribed && (
        <TouchableOpacity style={s.adFreeFooter} onPress={() => navigation.navigate('Subscription')}>
          <Text style={s.adFreeText}>{t('account.goAdFree')}</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },

  headerLogo: {
    width:        220,
    height:        50,
    alignSelf:    'center',
    marginBottom:  10,
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 6 },
  heroBtn: {
    paddingHorizontal: 9,
    paddingVertical:   5,
    borderRadius:      radius.sm,
    backgroundColor:  'rgba(255,255,255,0.18)',
  },
  heroBtnText: {
    fontSize:      10,
    fontWeight:    '600',
    color:         '#FFFFFF',
    letterSpacing:  1.5,
  },
  heroBtnRed:     { backgroundColor: 'rgba(220,50,50,0.25)' },
  heroBtnRedText: { color: '#FF5555' },

  heroStatus: {
    paddingHorizontal: 16,
    paddingBottom:      2,
  },
  heroStatusRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroStatusSpacer: { flex: 1 },
  onlineDot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  heroOnline: {
    fontSize:     12,
    fontWeight:   '500',
    color:        colors.primary,
    letterSpacing: 2,
  },
  heroMuted: {
    fontSize:     12,
    color:        colors.mutedOnDark,
    letterSpacing: 1.5,
    marginLeft:    8,
  },
  heroOffline: {
    fontSize:      16,
    fontWeight:    '500',
    color:         colors.mutedOnDark,
    letterSpacing:  2,
  },
  strikesRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  strikeCircle: {
    width:        22,
    height:       22,
    borderRadius: 11,
    borderWidth:   2,
    borderColor:  'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems:     'center',
  },
  strikeCircleHit: {
    borderColor:     '#FF5555',
    backgroundColor: 'rgba(220,50,50,0.2)',
  },
  strikeX: {
    fontSize:   11,
    fontWeight: '700',
    color:      '#FF5555',
    lineHeight: 14,
  },
  ratingBadge: {
    fontSize:      11,
    color:         '#F39C12',
    letterSpacing:  0.5,
    marginTop:      6,
  },

  // ── Map area ──
  mapArea:        { flex: 1, backgroundColor: colors.background },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  placeholderLogo: {
    height:       160,
    width:        160 * (1263 / 1050),
    marginBottom: 24,
  },
  mapPlaceholderText: {
    fontSize:      12,
    color:         colors.textSecondary,
    letterSpacing:  1.5,
    textAlign:     'center',
    lineHeight:    20,
  },

  // ── Job offer card ──
  offerModalBackdrop: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    paddingBottom:     40,
  },
  offerCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         16,
    shadowColor:    '#000',
    shadowOpacity:   0.1,
    shadowRadius:    8,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       6,
  },
  offerTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:    4,
  },
  offerType: {
    fontSize:      14,
    fontWeight:    '500',
    color:         colors.textPrimary,
    letterSpacing:  1,
    flex:           1,
    marginRight:    8,
  },
  offerTimerText: {
    fontSize:   20,
    fontWeight: '500',
    color:      colors.primary,
  },
  offerDistance: {
    fontSize:      12,
    color:         colors.textSecondary,
    letterSpacing:  0.5,
    marginBottom:   14,
  },
  offerBtns: { flexDirection: 'row', gap: 8 },
  declineBtn: {
    flex:            1,
    backgroundColor: colors.background,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    paddingVertical: 11,
    alignItems:      'center',
  },
  declineBtnText: {
    fontSize:     11,
    fontWeight:   '500',
    color:        colors.textPrimary,
    letterSpacing: 1.5,
  },
  acceptBtn: {
    flex:            2,
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 11,
    alignItems:      'center',
  },
  acceptBtnText: {
    fontSize:     11,
    fontWeight:   '500',
    color:        colors.onDark,
    letterSpacing: 1.5,
  },

  // ── Footer ──
  footer: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:      4,
    backgroundColor:   colors.background,
    borderTopWidth:     1,
    borderTopColor:    colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
  },
  primaryBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 16,
    alignItems:      'center',
  },
  secondaryBtnText: {
    color:         colors.textPrimary,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },

  relocateLink: {
    marginTop:  12,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  relocateLinkText: {
    fontSize:      12,
    color:         colors.primary,
    textAlign:     'center',
    lineHeight:    18,
    textDecorationLine: 'underline',
  },
  relocateCooldown: {
    marginTop:  12,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  relocateCooldownText: {
    fontSize:  12,
    color:     colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Ad modal ──
  adContainer: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    backgroundColor: colors.hero,
    padding:         32,
  },
  adTitle: {
    fontSize:      18,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing:  2,
    marginBottom:   8,
  },
  adSub: {
    fontSize:    14,
    color:       colors.mutedOnDark,
    marginBottom: 36,
    textAlign:   'center',
  },
  adBtn: {
    backgroundColor:   colors.primary,
    borderRadius:       radius.md,
    paddingVertical:   14,
    paddingHorizontal: 40,
    alignItems:        'center',
  },
  adBtnText: {
    color:         colors.onDark,
    fontSize:      12,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  adFreeFooter: {
    paddingVertical:   12,
    alignItems:        'center',
    borderTopWidth:    1,
    borderTopColor:    colors.border,
    backgroundColor:   colors.background,
  },
  adFreeText: {
    fontSize:      16,
    fontWeight:    '600',
    color:         colors.primary,
    letterSpacing: 0.5,
  },
});
