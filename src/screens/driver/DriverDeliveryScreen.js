import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Modal, ScrollView
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { watchLocation, haversineMeters } from '../../services/locationService';
import { markDeliveryCompleteDriver } from '../../services/jobService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../../i18n';

const COMPLETION_GEOFENCE_METERS = 6.1;

// Delivery has 3 phases:
// 1. 'to_store'     — driver heading to store
// 2. 'to_client'    — items picked up, heading to client
// 3. 'return_store' — delivery made, returning to store with payment

export default function DriverDeliveryScreen({ navigation, route }) {
  const { account } = useAuth();
  const job = route.params?.job;

  const [phase, setPhase]               = useState('to_store');
  const [driverLocation, setDriverLocation] = useState(null);
  const [canAdvance, setCanAdvance]     = useState(false);
  const [showAd, setShowAd]             = useState(false);
  const [completing, setCompleting]     = useState(false);

  const stopWatchingRef = useRef(null);

  useEffect(() => {
    if (!job) return;
    AsyncStorage.setItem('open_job_type', 'delivery');
    AsyncStorage.setItem('open_job_id', job.id);
    AsyncStorage.setItem('open_job', 'true');
    startLocationWatch();
    return () => { if (stopWatchingRef.current) stopWatchingRef.current(); };
  }, [job]);

  useEffect(() => {
    // Re-check geofence when phase changes
    if (driverLocation) checkGeofence(driverLocation);
  }, [phase]);

  async function startLocationWatch() {
    const stop = await watchLocation(loc => {
      setDriverLocation(loc);
      checkGeofence(loc);
    });
    stopWatchingRef.current = stop;
  }

  function checkGeofence(loc) {
    let targetLat, targetLng;
    if (phase === 'to_store' || phase === 'return_store') {
      targetLat = job.store_lat;
      targetLng = job.store_lng;
    } else {
      targetLat = job.client_lat;
      targetLng = job.client_lng;
    }
    const dist = haversineMeters(loc.lat, loc.lng, targetLat, targetLng);
    setCanAdvance(dist <= COMPLETION_GEOFENCE_METERS);
  }

  function getTargetCoords() {
    if (phase === 'to_store' || phase === 'return_store') {
      return { latitude: job.store_lat, longitude: job.store_lng };
    }
    return { latitude: job.client_lat, longitude: job.client_lng };
  }

  function getInstruction() {
    switch (phase) {
      case 'to_store':     return t('driverDelivery.toStore');
      case 'to_client':    return t('driverDelivery.toClient');
      case 'return_store': return t('driverDelivery.returnStore');
    }
  }

  function getButtonLabel() {
    switch (phase) {
      case 'to_store':     return t('driverDelivery.markPickedUp');
      case 'to_client':    return t('driverDelivery.markDelivered');
      case 'return_store': return t('driverDelivery.markComplete');
    }
  }

  function getWaitingLabel() {
    switch (phase) {
      case 'to_store':     return t('driverDelivery.arriveAtStore');
      case 'to_client':    return t('driverDelivery.arriveAtClient');
      case 'return_store': return t('driverDelivery.returnToStore');
    }
  }

  function handleAdvance() {
    if (phase === 'to_store') {
      setPhase('to_client');
      setCanAdvance(false);
    } else if (phase === 'to_client') {
      // Show photo reminder before marking delivered
      Alert.alert(
        t('driverDelivery.takePhoto'),
        t('driverDelivery.takePhotoMsg'),
        [
          { text: t('driverDelivery.gotIt'), onPress: () => setPhase('return_store') }
        ]
      );
      setCanAdvance(false);
    } else if (phase === 'return_store') {
      if (stopWatchingRef.current) stopWatchingRef.current();
      setShowAd(true);
    }
  }

  async function handleAdComplete() {
    setShowAd(false);
    setCompleting(true);

    const { error } = await markDeliveryCompleteDriver(job.id);

    if (error) {
      Alert.alert(
        t('shared.error'),
        t('driverDelivery.couldNotComplete'),
        [{ text: t('shared.retry'), onPress: () => handleAdComplete() }]
      );
      setCompleting(false);
      return;
    }

    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
    navigation.reset({ index: 0, routes: [{ name: 'DriverHome' }] });
  }

  if (!job) {
    return <View style={styles.centered}><Text>{t('shared.noJobData')}</Text></View>;
  }

  const target = getTargetCoords();

  return (
    <View style={styles.container}>

      {/* Ad modal */}
      <Modal visible={showAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>{t('shared.adTitle')}</Text>
          <Text style={styles.adSubtitle}>{t('shared.adSubtitle')}</Text>
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
          latitude: target.latitude,
          longitude: target.longitude,
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
        <Marker coordinate={target}
          title={phase === 'to_client' ? 'Client' : 'Store'}
          pinColor={phase === 'to_client' ? '#16a34a' : '#f59e0b'}
        />
      </MapView>

      {/* Info panel */}
      <ScrollView style={styles.infoPanel} scrollEnabled={false}>
        <Text style={styles.instruction}>{getInstruction()}</Text>

        {/* Order summary */}
        <View style={styles.orderRow}>
          <View style={styles.orderItem}>
            <Text style={styles.infoLabel}>{t('driverDelivery.orderTotal')}</Text>
            <Text style={styles.infoValue}>
              {job.order_total ? `$${job.order_total}` : t('driverDelivery.tbd')}
            </Text>
          </View>
          <View style={styles.orderItem}>
            <Text style={styles.infoLabel}>{t('driverDelivery.items')}</Text>
            <Text style={styles.infoValue}>
              {Array.isArray(job.items) ? job.items.length : 0}
            </Text>
          </View>
        </View>

        {job.order_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.infoLabel}>{t('driverDelivery.orderNotes')}</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        ) : null}

        {phase === 'return_store' && (
          <View style={styles.paymentReminder}>
            <Text style={styles.paymentReminderText}>
              {t('driverDelivery.collectPayment', { amount: job.order_total })}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action button */}
      <View style={styles.footer}>
        {canAdvance ? (
          <TouchableOpacity
            style={[styles.advanceBtn, completing && { opacity: 0.6 }]}
            onPress={handleAdvance}
            disabled={completing}
          >
            <Text style={styles.advanceBtnText}>{getButtonLabel()}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingBtn}>
            <Text style={styles.waitingBtnText}>{getWaitingLabel()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#fff' },
  centered:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map:                  { flex: 1 },
  infoPanel:            { maxHeight: 220, backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderColor: '#eee' },
  instruction:          { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  orderRow:             { flexDirection: 'row', gap: 16, marginBottom: 10 },
  orderItem:            { flex: 1 },
  infoLabel:            { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  infoValue:            { fontSize: 16, color: '#1a1a1a', fontWeight: '600', marginTop: 2 },
  notesBox:             { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginBottom: 10 },
  notesText:            { fontSize: 14, color: '#374151', marginTop: 4 },
  paymentReminder:      { backgroundColor: '#fef3c7', borderRadius: 8, padding: 12 },
  paymentReminderText:  { fontSize: 14, color: '#92400e', lineHeight: 20 },
  footer:               { padding: 16, paddingBottom: 32 },
  advanceBtn:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center' },
  advanceBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
  waitingBtn:           { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 18, alignItems: 'center' },
  waitingBtnText:       { color: '#9ca3af', fontSize: 15 },
  adContainer:          { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:              { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  adSubtitle:           { fontSize: 16, color: '#9ca3af', marginBottom: 40 },
  adButton:             { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:         { color: '#fff', fontWeight: '700', fontSize: 15 },
});
