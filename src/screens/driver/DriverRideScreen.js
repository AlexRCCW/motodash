import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { watchLocation, haversineMeters } from '../../services/locationService';
import { markRideCompleteDriver } from '../../services/jobService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';

const COMPLETION_GEOFENCE_METERS = 6.1;

export default function DriverRideScreen({ navigation, route }) {
  const { account } = useAuth();
  const job = route.params?.job;

  const [driverLocation, setDriverLocation] = useState(null);
  const [canComplete, setCanComplete]       = useState(false);
  const [showAd, setShowAd]                 = useState(false);
  const [completing, setCompleting]         = useState(false);

  const stopWatchingRef = useRef(null);

  useEffect(() => {
    if (!job) return;

    // Save open job to local storage — survives app close
    AsyncStorage.setItem('open_job_type', 'ride');
    AsyncStorage.setItem('open_job_id', job.id);
    AsyncStorage.setItem('open_job', 'true');

    // Start watching driver location
    startLocationWatch();

    return () => {
      if (stopWatchingRef.current) stopWatchingRef.current();
    };
  }, [job]);

  async function startLocationWatch() {
    const stop = await watchLocation(loc => {
      setDriverLocation(loc);

      // Check geofence — is driver within 6.1m of client?
      const dist = haversineMeters(
        loc.lat, loc.lng,
        job.client_lat, job.client_lng
      );
      setCanComplete(dist <= COMPLETION_GEOFENCE_METERS);
    });
    stopWatchingRef.current = stop;
  }

  function handleMarkComplete() {
    // Stop watching location — no need to keep polling
    if (stopWatchingRef.current) stopWatchingRef.current();
    setShowAd(true);
  }

  async function handleAdComplete() {
    setShowAd(false);
    setCompleting(true);

    const { error } = await markRideCompleteDriver(job.id);

    if (error) {
      // If call fails, keep open_job true so we can retry on relaunch
      Alert.alert(
        t('shared.error'),
        t('driverRide.couldNotComplete'),
        [{ text: t('shared.retry'), onPress: () => handleAdComplete() }]
      );
      setCompleting(false);
      return;
    }

    // Clear local storage only after server confirms
    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);

    navigation.reset({
      index: 0,
      routes: [{ name: 'DriverHome' }],
    });
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text>{t('shared.noJobData')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Ad modal — replace with real ad SDK */}
      <Modal visible={showAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>{t('shared.adTitle')}</Text>
          <Text style={styles.adSubtitle}>{t('shared.adSubtitle')}</Text>
          <Text style={styles.adNote}>
            Replace with your ad SDK.{'\n'}
            Call handleAdComplete() when the ad finishes.
          </Text>
          <TouchableOpacity style={styles.adButton} onPress={handleAdComplete}>
            <Text style={styles.adButtonText}>{t('shared.adComplete')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Map */}
      <MapView
        style={styles.map}
        region={driverLocation ? {
          latitude: driverLocation.lat,
          longitude: driverLocation.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : {
          latitude: job.client_lat,
          longitude: job.client_lng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
      >
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            title="You"
            pinColor="#2563eb"
          />
        )}
        <Marker
          coordinate={{ latitude: job.client_lat, longitude: job.client_lng }}
          title="Client"
          pinColor="#16a34a"
        />
      </MapView>

      {/* Info panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.instruction}>{t('driverRide.goToClient')}</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('driverRide.distance')}</Text>
            <Text style={styles.infoValue}>{job.initial_distance_km?.toFixed(1)} km</Text>
          </View>
          {job.client_notes ? (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('driverRide.notes')}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{job.client_notes}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Complete button — only visible in geofence */}
      <View style={styles.footer}>
        {canComplete ? (
          <TouchableOpacity
            style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
            onPress={handleMarkComplete}
            disabled={completing}
          >
            <Text style={styles.completeBtnText}>
              {completing ? t('driverRide.completing') : t('driverRide.markComplete')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingBtn}>
            <Text style={styles.waitingBtnText}>
              {t('driverRide.arriveToComplete')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  centered:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map:                { flex: 1 },
  infoPanel:          { backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#eee' },
  instruction:        { fontSize: 17, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  infoRow:            { flexDirection: 'row', gap: 16 },
  infoItem:           { flex: 1 },
  infoLabel:          { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  infoValue:          { fontSize: 15, color: '#1a1a1a', marginTop: 2 },
  footer:             { padding: 16, paddingBottom: 32 },
  completeBtn:        { backgroundColor: '#16a34a', borderRadius: 12, padding: 18, alignItems: 'center' },
  completeBtnDisabled:{ opacity: 0.6 },
  completeBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  waitingBtn:         { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 18, alignItems: 'center' },
  waitingBtnText:     { color: '#9ca3af', fontSize: 15 },
  adContainer:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:            { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  adSubtitle:         { fontSize: 16, color: '#9ca3af', marginBottom: 24 },
  adNote:             { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  adButton:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
});
