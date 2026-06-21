import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../config/supabase';
import { requestLocationPermission, getCurrentLocation } from '../../services/locationService';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

const STORE_TYPE_ICONS = {
  grocery:    '🛒',
  general:    '🏪',
  restaurant: '🍽️',
  hardware:   '🔧',
  clothing:   '👕',
  food_cart:  '🌮',
};

export default function ClientStoresScreen({ navigation }) {
  const [stores,   setStores]   = useState([]);
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading,  setLoading]  = useState(true);
  const [location, setLocation] = useState(null);

  useEffect(() => { loadStores(); }, []);

  async function loadStores() {
    setLoading(true);

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      Alert.alert(t('shared.locationRequired'), t('clientStores.locationRequiredMsg'));
      setLoading(false);
      return;
    }

    const loc = await getCurrentLocation();
    if (!loc) {
      Alert.alert(t('shared.locationError'), t('shared.locationErrorMsg'));
      setLoading(false);
      return;
    }
    setLocation(loc);

    // SECURITY DEFINER RPC — bypasses accounts RLS so we can join store + account status
    const { data, error } = await supabase.rpc('get_stores_near', {
      p_lat:       loc.lat,
      p_lng:       loc.lng,
      p_radius_km: 3,
    });

    if (error) {
      Alert.alert(t('shared.error'), error.message ?? t('clientStores.loadError'));
      setLoading(false);
      return;
    }

    setStores(data ?? []);
    setLoading(false);
  }

  function isStoreOpen(store) {
    const now    = new Date();
    const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
    const today  = dayMap[now.getDay()];
    if (!store.days_open?.includes(today)) return false;
    const [oh, om] = store.open_hour.split(':').map(Number);
    const [ch, cm] = store.close_hour.split(':').map(Number);
    const mins = now.getHours() * 60 + now.getMinutes();
    return mins >= (oh * 60 + om) && mins <= (ch * 60 + cm);
  }

  function renderStore({ item }) {
    const open     = isStoreOpen(item);
    const typeIcon = STORE_TYPE_ICONS[item.store_type] ?? '🏪';

    return (
      <TouchableOpacity
        style={[styles.storeCard, !open && styles.storeCardClosed]}
        activeOpacity={0.75}
        onPress={() =>
          open
            ? navigation.navigate('ClientInventory', { store: item, clientLocation: location })
            : Alert.alert(
                t('clientStores.storeClosed'),
                t('clientStores.storeClosedMsg', { name: item.store_name })
              )
        }
      >
        {/* Storefront thumbnail */}
        {item.storefront_image_url ? (
          <Image
            source={{ uri: item.storefront_image_url }}
            style={styles.storeThumbnail}
          />
        ) : (
          <View style={styles.storeThumbnailPlaceholder}>
            <Text style={styles.storeThumbnailIcon}>{typeIcon}</Text>
          </View>
        )}

        {/* Store info */}
        <View style={styles.storeInfo}>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName}>{item.store_name}</Text>
            {item.store_type && (
              <Text style={styles.storeTypeTag}>{typeIcon}</Text>
            )}
          </View>
          <Text style={styles.storeDistance}>
            {t('clientStores.kmAway', { distance: item.distance_km.toFixed(1) })}
          </Text>
          <Text style={styles.storeHours}>
            {item.open_hour?.slice(0,5)} – {item.close_hour?.slice(0,5)}
          </Text>
        </View>

        {/* Status + arrow */}
        <View style={styles.storeRight}>
          <View style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusBadgeText}>
              {open ? t('clientStores.open').toUpperCase() : t('clientStores.closed').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
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
          <Text style={styles.heroTitle}>{t('clientStores.title').toUpperCase()}</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {/* Mixed-cart warning */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t('clientStores.mixingWarning')}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>{t('clientStores.findingStores').toUpperCase()}</Text>
        </View>
      ) : stores.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyText}>{t('clientStores.noStores').toUpperCase()}</Text>
          <Text style={styles.emptySubtext}>{t('clientStores.noStoresSubtext')}</Text>
        </View>
      ) : (
        <FlatList
          data={stores}
          keyExtractor={item => item.id}
          renderItem={renderStore}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingTop:     10,
    paddingBottom:  4,
  },
  heroTitle:    { fontSize: 14, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroBackBtn:  { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: colors.mutedOnDark, letterSpacing: 1.5 },

  // Warning banner
  notice: {
    backgroundColor: colors.surface,
    padding:         12,
    borderBottomWidth: 1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  noticeText: { fontSize: 13, color: colors.textPrimary },

  // States
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText: {
    color:         colors.textSecondary,
    fontSize:      11,
    marginTop:     12,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  emptyIcon:   { fontSize: 48, marginBottom: 12 },
  emptyText: {
    fontSize:      13,
    fontWeight:    '500',
    color:         colors.textPrimary,
    marginBottom:  6,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  emptySubtext:{ fontSize: 14, color: colors.textSecondary, textAlign: 'center' },

  // List
  list: { padding: 16 },

  // Store card
  storeCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         12,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     colors.border,
    gap:             12,
  },
  storeCardClosed: { opacity: 0.5 },

  // Thumbnail
  storeThumbnail: {
    width:        56,
    height:       56,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
  },
  storeThumbnailPlaceholder: {
    width:           56,
    height:          56,
    borderRadius:    radius.sm,
    backgroundColor: colors.border,
    justifyContent:  'center',
    alignItems:      'center',
  },
  storeThumbnailIcon: { fontSize: 28 },

  // Info
  storeInfo:    { flex: 1 },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  storeName:    { fontSize: 15, fontWeight: '500', color: colors.textPrimary, flexShrink: 1 },
  storeTypeTag: { fontSize: 14 },
  storeDistance:{ fontSize: 12, color: colors.textSecondary, marginTop: 3 },
  storeHours:   { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Status
  storeRight:  { alignItems: 'center', gap: 8 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      radius.sm,
  },
  statusOpen:       { backgroundColor: colors.primary },
  statusClosed:     { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statusBadgeText: {
    fontSize:      10,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  arrow: { fontSize: 22, color: colors.textSecondary },
});
