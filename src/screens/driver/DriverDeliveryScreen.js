import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import MapMarkerPin from '../../components/MapMarkerPin';
import { useAuth } from '../../context/AuthContext';
import { requestLocationPermission, watchLocation, haversineMeters } from '../../services/locationService';
import { markDeliveryCompleteDriver, markDeliveredToClient, notifyClientDeliveryUpdate, notifyClientArrival } from '../../services/jobService';
import { setupNotificationListeners } from '../../services/notificationService';
import { supabase } from '../../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showInterstitial } from '../../services/adService';
import AnimatedPressButton from '../../components/AnimatedPressButton';

// 300 ft — store pickup/return (GPS accuracy on mobile is rarely < 6m)
const STORE_GEOFENCE_METERS  = 60.96;
const CLIENT_GEOFENCE_METERS = 60.96;

// Delivery has 3 phases:
// 1. 'to_store'     — driver heading to store
// 2. 'to_client'    — items picked up, heading to client
// 3. 'return_store' — delivery made, returning to store with payment

export default function DriverDeliveryScreen({ navigation, route }) {
  const { account } = useAuth();
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const job = route.params?.job;

  const [phase, setPhase]                   = useState('to_store');
  const [driverLocation, setDriverLocation] = useState(null);
  const [canAdvance, setCanAdvance]         = useState(false);
  const [completing, setCompleting]         = useState(false);

  const stopWatchingRef    = useRef(null);
  const mapRef             = useRef(null);
  const arrivalNotifiedRef = useRef(false);
  // Ref so the watchLocation callback always reads the latest phase
  // without a stale closure — plain state captured at subscription time
  // would stay stuck on 'to_store' forever.
  const phaseRef = useRef('to_store');

  // Keep ref in sync whenever phase state changes
  useEffect(() => {
    phaseRef.current = phase;
    // Persist phase so it survives app reinstall / force-close
    AsyncStorage.setItem('open_job_phase', phase);
  }, [phase]);

  useEffect(() => {
    if (!job) return;
    AsyncStorage.setItem('open_job_type', 'delivery');
    AsyncStorage.setItem('open_job_id', job.id);
    AsyncStorage.setItem('open_job', 'true');

    // Restore the phase the driver was on before the app closed
    AsyncStorage.getItem('open_job_phase').then(saved => {
      const valid = ['to_store', 'to_client', 'return_store'];
      if (saved && valid.includes(saved)) {
        setPhase(saved);
        phaseRef.current = saved;
      }
    });

    startLocationWatch();

    const cleanupNotifs = setupNotificationListeners({
      onJobOffer: (data) => {
        if (data?.type === 'delivery_unassigned' && data?.job_id === job.id) {
          if (stopWatchingRef.current) stopWatchingRef.current();
          AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id', 'open_job_phase']);
          Alert.alert(
            t('driverDelivery.unassignedTitle'),
            t('driverDelivery.unassignedMsg'),
            [{ text: t('shared.ok'), onPress: () => navigation.reset({ index: 0, routes: [{ name: 'DriverHome' }] }) }]
          );
        }
      },
    });

    return () => {
      if (stopWatchingRef.current) stopWatchingRef.current();
      cleanupNotifs();
    };
  }, [job]);

  async function startLocationWatch() {
    await requestLocationPermission(); // ensure permission before watching
    const stop = await watchLocation(loc => {
      setDriverLocation(loc);
      checkGeofence(loc);
      const currentPhase = phaseRef.current;
      const destCoord = (currentPhase === 'to_store' || currentPhase === 'return_store')
        ? { latitude: job.store_lat, longitude: job.store_lng }
        : { latitude: job.client_lat, longitude: job.client_lng };
      if (currentPhase === 'to_client' && !arrivalNotifiedRef.current) {
        const dist = haversineMeters(loc.lat, loc.lng, job.client_lat, job.client_lng);
        if (dist <= 76.2) {
          arrivalNotifiedRef.current = true;
          notifyClientArrival(job.id, 'delivery').catch(() => {});
        }
      }
      fitMap(loc, destCoord);
    });
    stopWatchingRef.current = stop;
  }

  function fitMap(driverLoc, destCoord) {
    mapRef.current?.fitToCoordinates(
      [
        { latitude: driverLoc.lat, longitude: driverLoc.lng },
        destCoord,
      ],
      { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
    );
  }

  function checkGeofence(loc) {
    // Use phaseRef — NOT the phase state variable.
    // The watchLocation callback is created once and would capture a stale
    // closure if we read `phase` directly; phaseRef.current is always fresh.
    const currentPhase = phaseRef.current;
    let targetLat, targetLng, geofence;
    if (currentPhase === 'to_store' || currentPhase === 'return_store') {
      targetLat = job.store_lat;
      targetLng = job.store_lng;
      geofence  = STORE_GEOFENCE_METERS;
    } else {
      targetLat = job.client_lat;
      targetLng = job.client_lng;
      geofence  = CLIENT_GEOFENCE_METERS;
    }
    const dist = haversineMeters(loc.lat, loc.lng, targetLat, targetLng);
    setCanAdvance(dist <= geofence);
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

  async function handleAdvance() {
    if (phase === 'to_store') {
      setPhase('to_client');
      setCanAdvance(false);
      // Notify client their order has been picked up and is on the way
      notifyClientDeliveryUpdate(job.id, 'picked_up').catch(() => {});
    } else if (phase === 'to_client') {
      // Show photo reminder before marking delivered
      Alert.alert(
        t('driverDelivery.takePhoto'),
        t('driverDelivery.takePhotoMsg'),
        [
          {
            text: t('driverDelivery.gotIt'),
            onPress: async () => {
              setPhase('return_store');
              // Update DB so client sees 'delivered' immediately via realtime
              markDeliveredToClient(job.id).catch(() => {});
              // Push notification to client
              notifyClientDeliveryUpdate(job.id, 'delivered').catch(() => {});
            },
          }
        ]
      );
      setCanAdvance(false);
    } else if (phase === 'return_store') {
      if (stopWatchingRef.current) stopWatchingRef.current();
      setCompleting(true);

      const { error } = await markDeliveryCompleteDriver(job.id);

      if (error) {
        Alert.alert(
          t('shared.error'),
          t('driverDelivery.couldNotComplete'),
          [{ text: t('shared.retry'), onPress: () => handleAdvance() }]
        );
        setCompleting(false);
        return;
      }

      await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id', 'open_job_phase']);
      supabase.from('driver_profiles').update({ ready_for_rides: true }).eq('id', account.id).then(() => {});
      showInterstitial().catch(() => {});
      navigation.reset({ index: 0, routes: [{ name: 'DriverHome' }] });
    }
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>{t('shared.noJobData')}</Text>
      </View>
    );
  }

  const target = getTargetCoords();

  return (
    <View style={styles.container}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <Image source={require('../../../assets/app-logoV2.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.heroSubtitle}>{getInstruction().toUpperCase()}</Text>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude:      target.latitude,
          longitude:     target.longitude,
          latitudeDelta:  0.02,
          longitudeDelta: 0.02,
        }}
      >
        {driverLocation && (
          <Marker
            coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            title="You"
            anchor={{ x: 0.5, y: 1 }}
          >
            <MapMarkerPin emoji="🏍️" />
          </Marker>
        )}
        <Marker
          coordinate={target}
          title={phase === 'to_client' ? 'Client' : 'Store'}
          anchor={{ x: 0.5, y: 1 }}
        >
          <MapMarkerPin
            emoji={phase === 'to_client' ? '👤' : '🏪'}
           
          />
        </Marker>
      </MapView>

      {/* Info panel */}
      <ScrollView style={styles.infoPanel} scrollEnabled={false}>

        {/* Order summary */}
        <View style={styles.orderRow}>
          <View style={styles.orderItem}>
            <Text style={styles.infoLabel}>{t('driverDelivery.orderLabel').toUpperCase()}</Text>
            <Text style={styles.infoValue}>#{job.id.slice(-8).toUpperCase()}</Text>
          </View>
          <View style={styles.orderItem}>
            <Text style={styles.infoLabel}>{t('driverDelivery.orderTotal').toUpperCase()}</Text>
            <Text style={styles.infoValue}>
              {job.order_total != null ? `$${Number(job.order_total).toFixed(2)}` : t('driverDelivery.tbd')}
            </Text>
          </View>
          <View style={styles.orderItem}>
            <Text style={styles.infoLabel}>{t('driverDelivery.items').toUpperCase()}</Text>
            <Text style={styles.infoValue}>
              {Array.isArray(job.items) ? job.items.length : 0}
            </Text>
          </View>
        </View>

        {job.order_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.infoLabel}>{t('driverDelivery.orderNotes').toUpperCase()}</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        ) : null}

        {phase === 'return_store' && (
          <View style={styles.paymentReminder}>
            <Text style={styles.paymentReminderText}>
              {t('driverDelivery.collectPayment', { amount: job.order_total != null ? Number(job.order_total).toFixed(2) : '—' })}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action button */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        {canAdvance ? (
          <AnimatedPressButton
            style={[styles.advanceBtn, completing && { opacity: 0.6 }]}
            onPress={handleAdvance}
            disabled={completing}
          >
            <Text style={styles.advanceBtnText}>{getButtonLabel().toUpperCase()}</Text>
          </AnimatedPressButton>
        ) : (
          <View style={styles.waitingBtn}>
            <Text style={styles.waitingBtnText}>{getWaitingLabel().toUpperCase()}</Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.background },
  centered:   { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredText: { fontSize: 14, color: colors.textSecondary },

  // ── Hero panel ──
  hero:        { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader:  { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  headerLogo:  { width: 220, height: 50, alignSelf: 'center', marginBottom: 10 },
  heroSubtitle:{ fontSize: 12, color: colors.mutedOnDark, letterSpacing: 1.5, marginTop: 4 },

  map: { flex: 1 },

  infoPanel: {
    maxHeight:        200,
    backgroundColor:  colors.background,
    padding:          16,
    borderTopWidth:   1,
    borderColor:      colors.border,
  },
  orderRow:   { flexDirection: 'row', gap: 16, marginBottom: 10 },
  orderItem:  { flex: 1 },
  infoLabel: {
    fontSize:      11,
    color:         colors.textSecondary,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
    marginBottom:   4,
  },
  infoValue: { fontSize: 15, color: colors.textPrimary, fontWeight: '500' },
  notesBox:  {
    backgroundColor: colors.surface,
    borderRadius:    radius.sm,
    padding:         10,
    marginBottom:    10,
  },
  notesText: { fontSize: 14, color: colors.textPrimary, marginTop: 4 },
  paymentReminder: {
    backgroundColor: colors.surface,
    borderRadius:    radius.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         12,
  },
  paymentReminderText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  footer: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:      4,
    backgroundColor:   colors.background,
    borderTopWidth:     1,
    borderTopColor:    colors.border,
  },
  advanceBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
  },
  advanceBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  waitingBtn: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  waitingBtnText: {
    color:         colors.textSecondary,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  1.5,
  },

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
