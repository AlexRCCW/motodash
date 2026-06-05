import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Modal, Animated
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { requestLocationPermission, getCurrentLocation } from '../../services/locationService';
import { setDriverReady, setDriverNotReady, incrementDriverRefusals, acceptRideJob, acceptDeliveryJob } from '../../services/jobService';
import { registerForPushNotifications, setupNotificationListeners } from '../../services/notificationService';
import { t } from '../../i18n';

const OFFER_TIMEOUT_SECONDS = 15;

export default function DriverHomeScreen({ navigation }) {
  const { account } = useAuth();
  const [status, setStatus]         = useState('idle'); // idle | loading | waiting | on_job
  const [location, setLocation]     = useState(null);
  const [jobOffer, setJobOffer]     = useState(null);  // incoming offer data
  const [offerTimer, setOfferTimer] = useState(0);
  const [showAd, setShowAd]         = useState(false);

  const timerRef    = useRef(null);
  const cleanupRef  = useRef(null);

  useEffect(() => {
    // Register for push notifications on mount
    if (account?.id) {
      registerForPushNotifications(account.id);
    }

    // Set up notification listeners
    const cleanup = setupNotificationListeners({
      onJobOffer: handleJobOffer,
    });
    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [account?.id]);

  function handleJobOffer(data) {
    // Only show offer if we're in waiting state
    setJobOffer(data);
    setOfferTimer(OFFER_TIMEOUT_SECONDS);

    // Start countdown
    timerRef.current = setInterval(() => {
      setOfferTimer(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleRefuse(data); // auto-refuse on timeout
          return 0;
        }
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

    // Get current location for job snapshot
    const loc = await getCurrentLocation();

    if (jobOffer.type === 'ride_offer') {
      const { data, error } = await acceptRideJob({
        jobId: jobOffer.job_id,
        driverId: account.id,
        driverLat: loc?.lat,
        driverLng: loc?.lng,
      });
      if (!error && data) {
        navigation.navigate('DriverRide', { job: data });
      } else {
        Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
      }
    } else if (jobOffer.type === 'delivery_offer') {
      const { data, error } = await acceptDeliveryJob({
        jobId: jobOffer.job_id,
        driverId: account.id,
        driverLat: loc?.lat,
        driverLng: loc?.lng,
      });
      if (!error && data) {
        navigation.navigate('DriverDelivery', { job: data });
      } else {
        Alert.alert(t('driverHome.jobUnavailable'), t('driverHome.jobTaken'));
      }
    }
  }

  async function handleMarkReady() {
    setStatus('loading');

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
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

    // Show playable ad before going active
    setShowAd(true);
  }

  async function handleAdComplete() {
    setShowAd(false);
    const loc = location;

    const { error } = await setDriverReady(account.id, loc.lat, loc.lng);
    if (error) {
      Alert.alert(t('shared.error'), t('driverHome.statusUpdateError'));
      setStatus('idle');
      return;
    }

    setStatus('waiting');
  }

  async function handleGoOffline() {
    await setDriverNotReady(account.id);
    setStatus('idle');
    setLocation(null);
  }

  // ── AD PLACEHOLDER ──────────────────────────────────────────
  // Replace this Modal with your actual ad SDK component
  const AdModal = () => (
    <Modal visible={showAd} animationType="slide" transparent={false}>
      <View style={styles.adContainer}>
        <Text style={styles.adTitle}>{t('shared.adTitle')}</Text>
        <Text style={styles.adSubtitle}>{t('shared.adPlayable')}</Text>
        <Text style={styles.adNote}>
          Replace this with your ad SDK component.{'\n'}
          Call handleAdComplete() when the ad finishes.
        </Text>
        <TouchableOpacity style={styles.adButton} onPress={handleAdComplete}>
          <Text style={styles.adButtonText}>{t('shared.adComplete')}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );

  // ── JOB OFFER BANNER ────────────────────────────────────────
  const JobOfferBanner = () => {
    if (!jobOffer) return null;
    return (
      <View style={styles.offerBanner}>
        <View style={styles.offerInfo}>
          <Text style={styles.offerType}>
            {jobOffer.type === 'ride_offer' ? t('driverHome.rideOffer') : t('driverHome.deliveryOffer')}
          </Text>
          <Text style={styles.offerDetail}>{t('driverHome.kmAway', { distance: jobOffer.distance_km?.toFixed(1) })}</Text>
        </View>
        <Text style={styles.offerTimer}>{offerTimer}s</Text>
        <View style={styles.offerButtons}>
          <TouchableOpacity
            style={styles.refuseBtn}
            onPress={() => handleRefuse(jobOffer)}
          >
            <Text style={styles.refuseBtnText}>{t('driverHome.decline')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
            <Text style={styles.acceptBtnText}>{t('driverHome.accept')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <AdModal />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('driverHome.title')}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('DriverStats')}
          >
            <Text style={styles.headerBtnText}>{t('driverHome.stats')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Instructions')}
          >
            <Text style={styles.headerBtnText}>{t('driverHome.help')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={logout}>
            <Text style={styles.headerBtnText}>{t('auth.signOut')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Map */}
      <View style={styles.mapContainer}>
        {location ? (
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
          >
            <Marker
              coordinate={{ latitude: location.lat, longitude: location.lng }}
              title="You"
              pinColor="#2563eb"
            />
          </MapView>
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              {t('driverHome.markReadyFirst')}
            </Text>
          </View>
        )}
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        {status === 'idle' && (
          <Text style={styles.statusText}>{t('driverHome.offline')}</Text>
        )}
        {status === 'loading' && (
          <ActivityIndicator color="#2563eb" />
        )}
        {status === 'waiting' && (
          <Text style={styles.statusTextActive}>
            {t('driverHome.waiting')}
          </Text>
        )}
      </View>

      {/* Job offer banner */}
      <JobOfferBanner />

      {/* Main action button */}
      <View style={styles.footer}>
        {status === 'idle' && (
          <TouchableOpacity style={styles.readyBtn} onPress={handleMarkReady}>
            <Text style={styles.readyBtnText}>{t('driverHome.markReady')}</Text>
          </TouchableOpacity>
        )}
        {status === 'waiting' && (
          <TouchableOpacity style={styles.offlineBtn} onPress={handleGoOffline}>
            <Text style={styles.offlineBtnText}>{t('driverHome.goOffline')}</Text>
          </TouchableOpacity>
        )}
        {status === 'loading' && (
          <View style={[styles.readyBtn, { opacity: 0.6 }]}>
            <Text style={styles.readyBtnText}>{t('driverHome.gettingLocation')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle:        { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  headerRight:        { flexDirection: 'row', gap: 12 },
  headerBtn:          { padding: 6 },
  headerBtnText:      { color: '#2563eb', fontSize: 14, fontWeight: '500' },
  mapContainer:       { flex: 1 },
  map:                { flex: 1 },
  mapPlaceholder:     { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  mapPlaceholderText: { color: '#9ca3af', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  statusBar:          { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderColor: '#eee' },
  statusText:         { color: '#6b7280', fontSize: 15 },
  statusTextActive:   { color: '#16a34a', fontSize: 15, fontWeight: '600' },
  footer:             { padding: 16, paddingBottom: 32 },
  readyBtn:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center' },
  readyBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  offlineBtn:         { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 18, alignItems: 'center' },
  offlineBtnText:     { color: '#374151', fontSize: 16, fontWeight: '600' },
  offerBanner:        { position: 'absolute', bottom: 110, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  offerInfo:          { marginBottom: 8 },
  offerType:          { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  offerDetail:        { fontSize: 14, color: '#6b7280', marginTop: 2 },
  offerTimer:         { position: 'absolute', top: 16, right: 16, fontSize: 22, fontWeight: '700', color: '#dc2626' },
  offerButtons:       { flexDirection: 'row', gap: 10, marginTop: 8 },
  refuseBtn:          { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, alignItems: 'center' },
  refuseBtnText:      { color: '#374151', fontWeight: '600' },
  acceptBtn:          { flex: 2, backgroundColor: '#16a34a', borderRadius: 10, padding: 14, alignItems: 'center' },
  acceptBtnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },
  adContainer:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:            { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  adSubtitle:         { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  adNote:             { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  adButton:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
});
