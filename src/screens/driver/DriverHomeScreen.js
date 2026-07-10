import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useAuth }        from '../../context/AuthContext';
import { logout }         from '../../services/authService';
import { supabase }       from '../../config/supabase';
import { requestLocationPermission, getCurrentLocation } from '../../services/locationService';
import {
  setDriverReady, setDriverNotReady, incrementDriverRefusals,
  acceptRideJob, acceptDeliveryJob, getDriverAverageRating,
} from '../../services/jobService';
import { registerForPushNotifications, setupNotificationListeners, consumePendingJobOffer } from '../../services/notificationService';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showPlayable } from '../../services/adService';
import { isNoAdsActive } from '../../services/subscriptionService';
import AdMessageOverlay from '../../components/AdMessageOverlay';

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
  const [avgRating,   setAvgRating]   = useState(null);
  const [ratingCount, setRatingCount] = useState(0);
  const timerRef = useRef(null);
  const adResolveRef = useRef(null);

  useEffect(() => {
    if (account?.id) {
      registerForPushNotifications(account.id);
      checkActiveJob();
    }
    isNoAdsActive().then(active => setSubscribed(active));
    getDriverAverageRating(account.id).then(({ average, count }) => {
      if (average !== null) { setAvgRating(average); setRatingCount(count); }
    });
    const cleanup = setupNotificationListeners({ onJobOffer: handleJobOffer });

    // consumePendingJobOffer covers cold-launch taps only.
    // addNotificationResponseReceivedListener (inside setupNotificationListeners)
    // already handles warm/background taps, so we only act here if the
    // response listener hasn't already set a job offer.
    consumePendingJobOffer().then(data => {
      if (data) {
        setJobOffer(prev => {
          if (prev) return prev; // listener already handled it
          handleJobOffer(data);
          return prev;
        });
      }
    });

    return () => {
      cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
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
    const { data: delivery } = await supabase
      .from('delivery_jobs')
      .select('*')
      .eq('driver_id', account.id)
      .eq('status', 'out_for_delivery')
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
    }
  }

  function renderRatingBadge() {
    if (avgRating === null) return null;
    return (
      <Text style={s.ratingBadge}>★ {avgRating.toFixed(1)}  ·  {ratingCount} {ratingCount === 1 ? 'rating' : 'ratings'}</Text>
    );
  }

  // ── Job offer ────────────────────────────────────────────────

  function handleJobOffer(data) {
    if (timerRef.current) clearInterval(timerRef.current);
    setJobOffer(data);
    setOfferTimer(OFFER_TIMEOUT);
    timerRef.current = setInterval(() => {
      setOfferTimer(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleRefuse(data); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  async function handleRefuse(offer) {
    clearInterval(timerRef.current);
    setJobOffer(null);
    const { limitReached } = await incrementDriverRefusals(account.id);
    if (limitReached) {
      Alert.alert(t('driverHome.markedUnavailable'), t('driverHome.refusedTooMany'));
      setStatus('idle');
    }
  }

  async function handleAccept() {
    if (!jobOffer) return;
    clearInterval(timerRef.current);
    setJobOffer(null);
    const loc = await getCurrentLocation();
    const args = { jobId: jobOffer.job_id, driverId: account.id, driverLat: loc?.lat, driverLng: loc?.lng };
    if (jobOffer.type === 'ride_offer') {
      const { data, error } = await acceptRideJob(args);
      if (!error && data) navigation.navigate('DriverRide', { job: data });
      else Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
    } else {
      const { data, error } = await acceptDeliveryJob(args);
      if (!error && data) navigation.navigate('DriverDelivery', { job: data });
      else Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
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
    setStatus('waiting');
  }

  async function handleGoOffline() {
    await setDriverNotReady(account.id);
    setStatus('idle');
    setLocation(null);
  }

  async function handleSignOut() {
    await setDriverNotReady(account.id);
    logout();
  }

  // ── Hero status copy ─────────────────────────────────────────

  function renderHeroStatus() {
    if (status === 'loading') {
      return (
        <View style={s.heroStatusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={s.heroMuted}>{t('driverHome.gettingLocation').toUpperCase()}</Text>
        </View>
      );
    }
    if (status === 'waiting') {
      return (
        <>
          <View style={s.heroStatusRow}>
            <View style={s.onlineDot} />
            <Text style={s.heroOnline}>ONLINE</Text>
          </View>
          <Text style={s.heroWaiting}>{t('driverHome.waiting').toUpperCase()}</Text>
          {location && (
            <Text style={s.heroCoords}>
              {location.lat.toFixed(5)}°  ·  {location.lng.toFixed(5)}°
            </Text>
          )}
        </>
      );
    }
    return <Text style={s.heroOffline}>{t('driverHome.offline').toUpperCase()}</Text>;
  }

  // ── Job offer card ───────────────────────────────────────────

  function renderJobOffer() {
    if (!jobOffer) return null;
    return (
      <View style={s.offerWrap}>
        <View style={s.offerCard}>
          <View style={s.offerTopRow}>
            <Text style={s.offerType}>
              {jobOffer.type === 'ride_offer'
                ? t('driverHome.rideOffer')
                : t('driverHome.deliveryOffer')}
            </Text>
            <Text style={s.offerTimerText}>{offerTimer}s</Text>
          </View>
          <Text style={s.offerDistance}>
            {t('driverHome.kmAway', { distance: jobOffer.distance?.toFixed(1) ?? '?' })}
          </Text>
          <View style={s.offerBtns}>
            <TouchableOpacity style={s.declineBtn} onPress={() => handleRefuse(jobOffer)}>
              <Text style={s.declineBtnText}>{t('driverHome.decline').toUpperCase()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.acceptBtn} onPress={handleAccept}>
              <Text style={s.acceptBtnText}>{t('driverHome.accept').toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
              pinColor={colors.primary}
            />
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

        {/* Job offer floats over map */}
        {renderJobOffer()}
      </View>

      {/* ── Footer action ── */}
      <SafeAreaView style={s.footer} edges={['bottom']}>
        {status === 'idle' && (
          <TouchableOpacity style={s.primaryBtn} onPress={handleMarkReady}>
            <Text style={s.primaryBtnText}>{t('driverHome.markReady').toUpperCase()}</Text>
          </TouchableOpacity>
        )}
        {status === 'waiting' && (
          <TouchableOpacity style={s.secondaryBtn} onPress={handleGoOffline}>
            <Text style={s.secondaryBtnText}>{t('driverHome.goOffline').toUpperCase()}</Text>
          </TouchableOpacity>
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
    backgroundColor:  'rgba(255,255,255,0.07)',
  },
  heroBtnText: {
    fontSize:      10,
    fontWeight:    '500',
    color:         colors.mutedOnDark,
    letterSpacing:  1.5,
  },
  heroBtnRed:     { backgroundColor: 'rgba(192,57,43,0.18)' },
  heroBtnRedText: { color: colors.primary },

  heroStatus: {
    paddingHorizontal: 16,
    paddingBottom:      2,
    gap:                3,
  },
  heroStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onlineDot:     { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  heroOnline: {
    fontSize:     12,
    fontWeight:   '500',
    color:        colors.primary,
    letterSpacing: 2,
  },
  heroWaiting: {
    fontSize:     12,
    color:        colors.mutedOnDark,
    letterSpacing: 1.5,
    marginTop:     1,
  },
  heroCoords: {
    fontSize:      10,
    color:         '#3d3d3d',
    letterSpacing:  0.5,
    marginTop:      5,
    fontVariant:   ['tabular-nums'],
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
  offerWrap: {
    position: 'absolute',
    bottom:   16,
    left:     16,
    right:    16,
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
