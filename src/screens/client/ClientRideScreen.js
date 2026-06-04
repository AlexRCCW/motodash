import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { requestLocationPermission, getCurrentLocation } from '../../services/locationService';
import { createRideJob, cancelRideJob, markRideCompleteClient, getRideJob } from '../../services/jobService';
import { supabase } from '../../config/supabase';

export default function ClientRideScreen({ navigation, route }) {
  const { account } = useAuth();
  const resuming = route.params?.resuming;

  const [location, setLocation]     = useState(null);
  const [job, setJob]               = useState(route.params?.job || null);
  const [status, setStatus]         = useState('idle'); // idle | requesting | waiting | accepted
  const [showAd, setShowAd]         = useState(false);
  const [completing, setCompleting] = useState(false);
  const [adShownWaiting, setAdShownWaiting] = useState(false);

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

  // Show waiting ad once driver is assigned
  useEffect(() => {
    if (status === 'waiting' && !adShownWaiting) {
      setAdShownWaiting(true);
      setShowAd(true);
    }
  }, [status]);

  async function initLocation() {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert('Location required', 'Please enable location to request a ride.');
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
      Alert.alert('Location unavailable', 'Please wait for your location to load.');
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
      Alert.alert('Error', 'Could not create ride request. Please try again.');
      setStatus('idle');
      return;
    }
    setJob(data);
    await AsyncStorage.setItem('open_job', 'true');
    await AsyncStorage.setItem('open_job_type', 'ride');
    await AsyncStorage.setItem('open_job_id', data.id);
    setStatus('waiting');
  }

  async function handleCancel() {
    Alert.alert('Cancel ride?', 'Are you sure you want to cancel this request?', [
      { text: 'No' },
      {
        text: 'Yes, cancel',
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

  function handleMarkComplete() {
    setShowAd(true);
  }

  async function handleAdComplete() {
    setShowAd(false);

    // If this was the waiting ad — just dismiss and continue waiting
    if (status === 'waiting') return;

    // This is the completion ad
    setCompleting(true);
    const { error } = await markRideCompleteClient(job.id);
    if (error) {
      Alert.alert('Error', 'Could not complete the ride. Please try again.',
        [{ text: 'Retry', onPress: () => handleAdComplete() }]
      );
      setCompleting(false);
      return;
    }
    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
    navigation.replace('ClientHome');
  }

  return (
    <View style={styles.container}>

      {/* Ad modal */}
      <Modal visible={showAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>MotoDash Partner Ad</Text>
          <Text style={styles.adSubtitle}>Video interstitial shown here</Text>
          <TouchableOpacity style={styles.adButton} onPress={handleAdComplete}>
            <Text style={styles.adButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
            pinColor="#2563eb"
          />
        )}
        {job?.driver_lat && job?.driver_lng && (
          <Marker
            coordinate={{ latitude: job.driver_lat, longitude: job.driver_lng }}
            title="Driver"
            pinColor="#f59e0b"
          />
        )}
      </MapView>

      {/* Bottom panel */}
      <View style={styles.panel}>
        {status === 'idle' && (
          <>
            <Text style={styles.panelTitle}>Ready for a ride?</Text>
            {!location ? (
              <ActivityIndicator color="#2563eb" style={{ marginBottom: 16 }} />
            ) : null}
            <TouchableOpacity
              style={[styles.primaryBtn, !location && styles.primaryBtnDisabled]}
              onPress={handleRequestRide}
              disabled={!location}
            >
              <Text style={styles.primaryBtnText}>Request a ride</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.backBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'requesting' && (
          <View style={styles.centeredPanel}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.statusText}>Creating your request...</Text>
          </View>
        )}

        {status === 'waiting' && (
          <>
            <Text style={styles.panelTitle}>Looking for a driver...</Text>
            <Text style={styles.statusSubtext}>
              You will be notified when a driver accepts
            </Text>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
              <Text style={styles.cancelBtnText}>Cancel request</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'accepted' && (
          <>
            <Text style={styles.panelTitle}>Driver is on the way 🏍️</Text>
            <Text style={styles.statusSubtext}>
              Your driver is {job?.initial_distance_km?.toFixed(1)} km away
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, completing && styles.primaryBtnDisabled]}
              onPress={handleMarkComplete}
              disabled={completing}
            >
              <Text style={styles.primaryBtnText}>Mark ride complete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  map:                { flex: 1 },
  panel:              { backgroundColor: '#fff', padding: 24, paddingBottom: 40, borderTopWidth: 1, borderColor: '#eee' },
  panelTitle:         { fontSize: 20, fontWeight: '700', color: '#1a1a1a', marginBottom: 8 },
  statusSubtext:      { fontSize: 15, color: '#6b7280', marginBottom: 20 },
  centeredPanel:      { alignItems: 'center', paddingVertical: 8 },
  statusText:         { color: '#6b7280', fontSize: 15, marginTop: 12 },
  primaryBtn:         { backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn:          { backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center' },
  cancelBtnText:      { color: '#dc2626', fontWeight: '600', fontSize: 15 },
  backBtn:            { alignItems: 'center', padding: 12 },
  backBtnText:        { color: '#6b7280', fontSize: 15 },
  adContainer:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:            { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  adSubtitle:         { fontSize: 16, color: '#9ca3af', marginBottom: 40 },
  adButton:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
});
