import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { useAuth } from '../../context/AuthContext';
import { requestLocationPermission, watchLocation, haversineMeters } from '../../services/locationService';
import { markRideCompleteDriver } from '../../services/jobService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

// 300 ft — matches real-world GPS accuracy on mobile devices
const CLIENT_GEOFENCE_METERS = 91.44;

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
    await requestLocationPermission(); // ensure permission before watching
    const stop = await watchLocation(loc => {
      setDriverLocation(loc);
      const dist = haversineMeters(loc.lat, loc.lng, job.client_lat, job.client_lng);
      setCanComplete(dist <= CLIENT_GEOFENCE_METERS);
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
    // ready_for_rides stays true — DriverHome restores waiting state automatically.
    navigation.reset({
      index: 0,
      routes: [{ name: 'DriverHome' }],
    });
  }

  if (!job) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>{t('shared.noJobData')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* Ad modal — replace with real ad SDK */}
      <Modal visible={showAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>{t('shared.adTitle').toUpperCase()}</Text>
          <Text style={styles.adSubtitle}>{t('shared.adSubtitle')}</Text>
          <Text style={styles.adNote}>
            Replace with your ad SDK.{'\n'}
            Call handleAdComplete() when the ad finishes.
          </Text>
          <TouchableOpacity style={styles.adButton} onPress={handleAdComplete}>
            <Text style={styles.adButtonText}>{t('shared.adComplete').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>MOTODASH</Text>
          <Text style={styles.heroSubtitle}>{t('driverRide.goToClient').toUpperCase()}</Text>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

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
            pinColor={colors.primary}
          />
        )}
        <Marker
          coordinate={{ latitude: job.client_lat, longitude: job.client_lng }}
          title="Client"
          pinColor={colors.textPrimary}
        />
      </MapView>

      {/* Info panel */}
      <View style={styles.infoPanel}>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>{t('driverRide.distance').toUpperCase()}</Text>
            <Text style={styles.infoValue}>{job.initial_distance_km?.toFixed(1)} km</Text>
          </View>
          {job.client_notes ? (
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>{t('driverRide.notes').toUpperCase()}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{job.client_notes}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Complete button — only visible in geofence */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        {canComplete ? (
          <TouchableOpacity
            style={[styles.completeBtn, completing && styles.completeBtnDisabled]}
            onPress={handleMarkComplete}
            disabled={completing}
          >
            <Text style={styles.completeBtnText}>
              {completing
                ? t('driverRide.completing').toUpperCase()
                : t('driverRide.markComplete').toUpperCase()}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingBtn}>
            <Text style={styles.waitingBtnText}>
              {t('driverRide.arriveToComplete').toUpperCase()}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered:  { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centeredText: { fontSize: 14, color: colors.textSecondary },

  // ── Hero panel ──
  hero:        { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader:  { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  heroTitle:   { fontSize: 18, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroSubtitle:{ fontSize: 12, color: colors.mutedOnDark, letterSpacing: 1.5, marginTop: 4 },

  map: { flex: 1 },

  infoPanel: {
    backgroundColor: colors.background,
    padding:         16,
    borderTopWidth:  1,
    borderColor:     colors.border,
  },
  infoRow:   { flexDirection: 'row', gap: 16 },
  infoItem:  { flex: 1 },
  infoLabel: {
    fontSize:      11,
    color:         colors.textSecondary,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
    marginBottom:   4,
  },
  infoValue: { fontSize: 15, color: colors.textPrimary },

  footer: {
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:      4,
    backgroundColor:   colors.background,
    borderTopWidth:     1,
    borderTopColor:    colors.border,
  },
  completeBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
  },
  completeBtnDisabled: { opacity: 0.6 },
  completeBtnText: {
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
    marginBottom: 16,
    textAlign:    'center',
  },
  adNote: {
    fontSize:     13,
    color:        colors.mutedOnDark,
    textAlign:    'center',
    marginBottom: 32,
    lineHeight:   20,
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
