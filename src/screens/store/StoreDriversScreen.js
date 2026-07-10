import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { addPreferredDriver, removePreferredDriver } from '../../services/jobService';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

// 300 feet in meters
const RADIUS_METERS = 91.44;

export default function StoreDriversScreen({ navigation }) {
  const { account } = useAuth();
  const [drivers,  setDrivers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [addingId,   setAddingId]   = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [added,      setAdded]      = useState(new Set());

  useEffect(() => { loadNearbyDrivers(); }, []);

  // ── Fetch ────────────────────────────────────────────────────

  async function loadNearbyDrivers() {
    setLoading(true);

    // 1. Location permission
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('shared.locationRequired'), t('storeDrivers.locationRequired'));
      setLoading(false);
      return;
    }

    // 2. Current position
    let coords;
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      coords = loc.coords;
    } catch {
      Alert.alert(t('shared.error'), t('storeDrivers.errorFinding'));
      setLoading(false);
      return;
    }

    // 3. Nearby drivers via SECURITY DEFINER RPC (bypasses accounts RLS)
    const { data, error } = await supabase.rpc('get_nearby_drivers', {
      p_store_id: account.id,
      p_lat:      coords.latitude,
      p_lng:      coords.longitude,
      p_radius_m: RADIUS_METERS,
    });

    if (error) {
      Alert.alert(t('shared.error'), t('storeDrivers.errorFinding'));
    } else {
      setDrivers(data ?? []);
      // Pre-seed the added set with already-preferred drivers
      const alreadyAdded = new Set(
        (data ?? []).filter(d => d.is_preferred).map(d => d.driver_id)
      );
      setAdded(alreadyAdded);
    }

    setLoading(false);
  }

  // ── Add to preferred ─────────────────────────────────────────

  async function handleAdd(driver) {
    setAddingId(driver.driver_id);
    const { error } = await addPreferredDriver(account.id, driver.driver_id);
    if (error) {
      Alert.alert(t('shared.error'), error.message);
    } else {
      setAdded(prev => new Set([...prev, driver.driver_id]));
    }
    setAddingId(null);
  }

  // ── Remove from preferred ────────────────────────────────────

  async function handleRemove(driver) {
    Alert.alert(
      'Remove driver?',
      `Remove ${driver.driver_name} from your preferred drivers?`,
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(driver.driver_id);
            const { error } = await removePreferredDriver(account.id, driver.driver_id);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
            } else {
              setAdded(prev => {
                const next = new Set(prev);
                next.delete(driver.driver_id);
                return next;
              });
            }
            setRemovingId(null);
          },
        },
      ]
    );
  }

  // ── Render ───────────────────────────────────────────────────

  function renderDriver({ item }) {
    const isAdded    = added.has(item.driver_id);
    const isAdding   = addingId === item.driver_id;
    const isRemoving = removingId === item.driver_id;
    const initial    = item.driver_name?.[0]?.toUpperCase() ?? '?';
    const distanceM  = Math.round(item.distance_m);

    return (
      <View style={styles.driverRow}>
        {/* Avatar */}
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        {/* Name + distance */}
        <View style={styles.driverInfo}>
          <Text style={styles.driverName}>{item.driver_name}</Text>
          <Text style={styles.driverDistance}>
            {t('storeDrivers.metersAway', { m: distanceM })}
          </Text>
        </View>

        {/* Add / Added button */}
        <TouchableOpacity
          style={[styles.addBtn, isAdded && styles.addBtnDone]}
          onPress={() => !isAdded && handleAdd(item)}
          disabled={isAdding || isRemoving}
          activeOpacity={0.75}
        >
          {isAdding ? (
            <ActivityIndicator color={colors.onDark} size="small" />
          ) : (
            <Text style={[styles.addBtnText, isAdded && styles.addBtnTextDone]}>
              {isAdded ? t('storeDrivers.added').toUpperCase() : t('storeDrivers.add').toUpperCase()}
            </Text>
          )}
        </TouchableOpacity>

        {/* Trash icon — only shown when driver is in preferred list */}
        {isAdded && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={() => handleRemove(item)}
            disabled={isRemoving}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isRemoving
              ? <ActivityIndicator color={colors.primary} size="small" />
              : <Text style={styles.removeIcon}>🗑</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.heroBackBtn}>
            <Text style={styles.heroBackText}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <View style={styles.heroCenter}>
            <Text style={styles.heroTitle}>{t('storeDrivers.title').toUpperCase()}</Text>
            <Text style={styles.heroSubtitle}>{t('storeDrivers.subtitle')}</Text>
          </View>
          {/* Refresh */}
          <TouchableOpacity style={styles.refreshBtn} onPress={loadNearbyDrivers}>
            <Text style={styles.refreshIcon}>↻</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('storeDrivers.gettingLocation').toUpperCase()}</Text>
        </View>
      ) : drivers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🏍️</Text>
          <Text style={styles.emptyTitle}>{t('storeDrivers.noDrivers').toUpperCase()}</Text>
          <Text style={styles.emptySubtext}>{t('storeDrivers.noDriversSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={drivers}
          keyExtractor={item => item.driver_id}
          renderItem={renderDriver}
          contentContainerStyle={styles.list}
        />
      )}

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        10,
    paddingBottom:     4,
  },
  heroBackBtn:  { width: 56 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: colors.mutedOnDark, letterSpacing: 1.5 },
  heroCenter:   { flex: 1, alignItems: 'center' },
  heroTitle:    { fontSize: 14, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroSubtitle: { fontSize: 11, color: colors.mutedOnDark, marginTop: 2 },
  refreshBtn:   { width: 56, alignItems: 'flex-end' },
  refreshIcon:  { fontSize: 22, color: colors.mutedOnDark },

  // States
  loadingText: {
    fontSize:      11,
    color:         colors.textSecondary,
    marginTop:     12,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
    fontWeight:    '500',
  },
  emptyIcon:    { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontSize:      13,
    fontWeight:    '500',
    color:         colors.textPrimary,
    marginBottom:  6,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  emptySubtext: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // List
  list: { padding: 16 },
  driverRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderColor:       colors.border,
    gap:               12,
  },

  // Avatar
  avatar: {
    width:           44,
    height:          44,
    borderRadius:    radius.sm,
    backgroundColor: colors.hero,
    justifyContent:  'center',
    alignItems:      'center',
  },
  avatarText: { fontSize: 18, fontWeight: '500', color: colors.onDark },

  // Driver info
  driverInfo:     { flex: 1 },
  driverName:     { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  driverDistance: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Add button
  addBtn: {
    backgroundColor:   colors.primary,
    paddingHorizontal: 14,
    paddingVertical:    8,
    borderRadius:       radius.sm,
    minWidth:           76,
    alignItems:        'center',
    justifyContent:    'center',
    minHeight:          34,
  },
  addBtnDone: {
    backgroundColor: '#1e7e34',
    borderWidth:     0,
  },
  addBtnText: {
    fontSize:      10,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  addBtnTextDone: { color: '#ffffff' },
  removeBtn: {
    width:           34,
    height:          34,
    borderRadius:    radius.sm,
    backgroundColor: 'rgba(192,57,43,0.12)',
    justifyContent:  'center',
    alignItems:      'center',
  },
  removeIcon: { fontSize: 16 },
});
