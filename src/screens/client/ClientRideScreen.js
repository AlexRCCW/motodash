import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import MapMarkerPin from '../../components/MapMarkerPin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { requestLocationPermission, getCurrentLocation, haversineMeters, formatDistance } from '../../services/locationService';
import { createRideJob, cancelRideJob, markRideCompleteClient, getRideJob, dispatchJob, submitDriverRating } from '../../services/jobService';
import { supabase } from '../../config/supabase';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showInterstitial } from '../../services/adService';
import AdMessageOverlay from '../../components/AdMessageOverlay';
import RatingModal from '../../components/RatingModal';
import AnimatedPressButton from '../../components/AnimatedPressButton';

export default function ClientRideScreen({ navigation, route }) {
  const { account } = useAuth();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const resuming = route.params?.resuming;

  const [location, setLocation]     = useState(null);
  const [job, setJob]               = useState(route.params?.job || null);
  const [status, setStatus]         = useState('idle'); // idle | requesting | waiting | accepted
  const [completing, setCompleting] = useState(false);
  const [adShownWaiting, setAdShownWaiting] = useState(false);
  const [showAdMsg, setShowAdMsg] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const ratingResolveRef = React.useRef(null);

  useEffect(() => {
    initLocation();
    if (resuming && job) {
      restoreJobState();
    }
  }, []);

  // Subscribe to job status changes via Supabase realtime
  useEffect(() => {
    if (!job?.id) return;
    const channel = supabase
      .channel(`ride_job_${job.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ride_jobs',
        filter: `id=eq.${job.id}`,
      }, payload => {
        setJob(payload.new);
        if (payload.new.status === 'accepted' && status !== 'accepted') {
          setStatus('accepted');
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [job?.id]);

  // Show overlay then ad once per session when status becomes 'waiting'
  useEffect(() => {
    if (status === 'waiting' && !adShownWaiting) {
      setAdShownWaiting(true);
      setShowAdMsg(true);
    }
  }, [status]);

  async function initLocation() {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert(t('shared.locationRequired'), t('clientRide.locationRequiredMsg'));
      return;
    }
    const loc = await getCurrentLocation();
    setLocation(loc);
  }

  function restoreJobState() {
    if (job.status === 'accepted') setStatus('accepted');
    else if (job.status === 'pending') setStatus('waiting');
  }

  async function handleRequestRide() {
    if (!location) {
      Alert.alert(t('clientRide.locationUnavailable'), t('clientRide.locationUnavailableMsg'));
      return;
    }
    setStatus('requesting');
    const { data, error } = await createRideJob({
      clientId: account.id,
      clientLat: location.lat,
      clientLng: location.lng,
      clientNotes: '',
    });
    if (error || !data) {
      Alert.alert(t('shared.error'), t('clientRide.couldNotCreate'));
      setStatus('idle');
      return;
    }
    setJob(data);
    await AsyncStorage.setItem('open_job', 'true');
    await AsyncStorage.setItem('open_job_type', 'ride');
    await AsyncStorage.setItem('open_job_id', data.id);
    setStatus('waiting');
    // Fire-and-forget: notify nearby drivers via Edge Function
    dispatchJob(data.id, 'ride').catch(e => console.error('dispatch-job error:', e));
  }

  async function handleCancel() {
    Alert.alert(t('clientRide.cancelRide'), t('clientRide.cancelConfirm'), [
      { text: t('shared.no') },
      {
        text: t('clientRide.yesCancel'),
        style: 'destructive',
        onPress: async () => {
          await cancelRideJob(job.id);
          await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
          setJob(null);
          setStatus('idle');
          setAdShownWaiting(false);
        },
      },
    ]);
  }

  async function handleMarkComplete() {
    setCompleting(true);
    await showInterstitial();

    // Collect rating before marking complete
    const ratingResult = await new Promise(resolve => {
      ratingResolveRef.current = resolve;
      setShowRating(true);
    });

    // Fire-and-forget rating submission — don't block the completion flow
    if (job?.driver_id) {
      submitDriverRating({
        driverId:   job.driver_id,
        clientId:   account.id,
        rideJobId:  job.id,
        rating:     ratingResult.rating,
        comment:    ratingResult.comment,
        isReport:   ratingResult.isReport,
      }).catch(() => {});
    }

    const { error } = await markRideCompleteClient(job.id);
    if (error) {
      Alert.alert(t('shared.error'), t('clientRide.couldNotComplete'),
        [{ text: t('shared.retry'), onPress: () => handleMarkComplete() }]
      );
      setCompleting(false);
      return;
    }
    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
    navigation.replace('ClientHome');
  }

  function handleRatingSubmit(result) {
    setShowRating(false);
    ratingResolveRef.current?.(result);
  }

  const CLIENT_AD_MESSAGES = [
    t('adMessage.clientWaiting'),
    t('adMessage.keepFree'),
    t('adMessage.goAdFree'),
  ];

  return (
    <View style={styles.container}>

      <AdMessageOverlay
        visible={showAdMsg}
        messages={CLIENT_AD_MESSAGES}
        onDone={() => { setShowAdMsg(false); showInterstitial(); }}
        navigation={navigation}
      />

      <RatingModal visible={showRating} onSubmit={handleRatingSubmit} />

      {/* Map */}
      <MapView
        style={styles.map}
        region={location ? {
          latitude: location.lat,
          longitude: location.lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        } : undefined}
      >
        {location && (
          <Marker
            coordinate={{ latitude: location.lat, longitude: location.lng }}
            title="You"
            anchor={{ x: 0.5, y: 1 }}
          >
            <MapMarkerPin emoji="👤" />
          </Marker>
        )}
        {job?.driver_lat && job?.driver_lng && (
          <Marker
            coordinate={{ latitude: job.driver_lat, longitude: job.driver_lng }}
            title="Driver"
            anchor={{ x: 0.5, y: 1 }}
          >
            <MapMarkerPin emoji="🏍️" />
          </Marker>
        )}
      </MapView>

      {/* Bottom panel */}
      <SafeAreaView style={styles.panel} edges={['bottom']}>
        {status === 'idle' && (
          <>
            <Text style={styles.panelTitle}>{t('clientRide.readyForRide').toUpperCase()}</Text>
            {!location ? (
              <ActivityIndicator style={{ marginBottom: 16 }} />
            ) : null}
            <AnimatedPressButton
              style={[styles.primaryBtn, (!location || status === 'requesting') && styles.primaryBtnDisabled]}
              onPress={handleRequestRide}
              disabled={!location || status === 'requesting'}
            >
              {status === 'requesting'
                ? <ActivityIndicator color={colors.onDark} />
                : <Text style={styles.primaryBtnText}>{t('clientRide.requestRide').toUpperCase()}</Text>
              }
            </AnimatedPressButton>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backBtnText}>{t('auth.back').toUpperCase()}</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'requesting' && (
          <View style={styles.centeredPanel}>
            <ActivityIndicator size="large" />
            <Text style={styles.statusText}>{t('clientRide.creatingRequest').toUpperCase()}</Text>
          </View>
        )}

        {status === 'waiting' && (
          <>
            <Text style={styles.panelTitle}>{t('clientRide.lookingForDriver').toUpperCase()}</Text>
            <Text style={styles.statusSubtext}>{t('clientRide.willBeNotified')}</Text>
            <AnimatedPressButton style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>{t('clientRide.cancelRequest').toUpperCase()}</Text>
            </AnimatedPressButton>
          </>
        )}

        {status === 'accepted' && (
          (() => {
            const driverNear = job?.driver_lat && job?.driver_lng && job?.client_lat && job?.client_lng
              ? haversineMeters(job.driver_lat, job.driver_lng, job.client_lat, job.client_lng) <= 250
              : false;
            return (
              <>
                <Text style={styles.panelTitle}>{t('clientRide.driverOnWay').toUpperCase()}</Text>
                <Text style={styles.statusSubtext}>
                  {driverNear
                    ? t('clientRide.driverNearby')
                    : t('clientRide.driverAway', { distance: formatDistance(job?.initial_distance_km) })}
                </Text>
                {driverNear ? (
                  <AnimatedPressButton
                    style={[styles.primaryBtn, completing && styles.primaryBtnDisabled]}
                    onPress={handleMarkComplete}
                    disabled={completing}
                  >
                    <Text style={styles.primaryBtnText}>{t('clientRide.markComplete').toUpperCase()}</Text>
                  </AnimatedPressButton>
                ) : (
                  <View style={styles.waitingForDriver}>
                    <Text style={styles.waitingForDriverText}>{t('clientRide.waitingForArrival')}</Text>
                  </View>
                )}
              </>
            );
          })()
        )}
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container:          { flex: 1, backgroundColor: colors.background },
  map:                { flex: 1 },
  panel: {
    backgroundColor: colors.background,
    padding:         24,
    paddingBottom:   12,
    borderTopWidth:  1,
    borderColor:     colors.border,
  },
  panelTitle: {
    fontSize:      13,
    fontWeight:    '500',
    color:         colors.textPrimary,
    marginBottom:  12,
    letterSpacing:  2,
    textTransform: 'uppercase',
  },
  statusSubtext: { fontSize: 14, color: colors.textSecondary, marginBottom: 20 },
  centeredPanel: { alignItems: 'center', paddingVertical: 8 },
  statusText: {
    color:         colors.textSecondary,
    fontSize:      11,
    marginTop:     12,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
    marginBottom:    12,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  cancelBtn: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.primary,
    paddingVertical: 16,
    alignItems:      'center',
  },
  cancelBtnText: {
    color:         colors.primary,
    fontWeight:    '500',
    fontSize:      13,
    letterSpacing:  2,
  },
  waitingForDriver: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 14,
    alignItems:      'center',
    marginBottom:    12,
  },
  waitingForDriverText: {
    fontSize:      12,
    color:         colors.textSecondary,
    letterSpacing:  0.5,
    textAlign:     'center',
  },
  backBtn:     { alignItems: 'center', padding: 12 },
  backBtnText: { color: '#ffffff', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },

  // ── Ad modal ──
  adContainer: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
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
  adSubtitle: {
    fontSize:     14,
    color:        colors.mutedOnDark,
    marginBottom: 40,
    textAlign:    'center',
  },
  adButton: {
    backgroundColor:   colors.primary,
    borderRadius:       radius.md,
    paddingVertical:   14,
    paddingHorizontal: 40,
    alignItems:        'center',
    width:             '100%',
  },
  adButtonText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
});
