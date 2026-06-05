import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { supabase } from '../../config/supabase';
import { requestLocationPermission, getCurrentLocation } from '../../services/locationService';
import { t } from '../../i18n';

export default function ClientStoresScreen({ navigation }) {
  const [stores, setStores]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    loadStores();
  }, []);

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

    // Pull stores then filter by radius server-side via RPC
    // For now we fetch all and filter client-side using haversine
    // In production, move this to a Supabase RPC for efficiency
    const { data, error } = await supabase
      .from('store_profiles')
      .select(`
        id,
        store_name,
        location_lat,
        location_lng,
        open_hour,
        close_hour,
        days_open,
        accounts!inner(name, status)
      `)
      .eq('accounts.status', 'active');

    if (error) {
      Alert.alert(t('shared.error'), t('clientStores.loadError'));
      setLoading(false);
      return;
    }

    // Filter by 3km radius using on-device haversine
    const nearby = (data || []).filter(store => {
      const dist = haversineKm(
        loc.lat, loc.lng,
        store.location_lat, store.location_lng
      );
      store.distance_km = dist;
      return dist <= 3;
    }).sort((a, b) => a.distance_km - b.distance_km);

    setStores(nearby);
    setLoading(false);
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }

  function toRad(deg) { return deg * Math.PI / 180; }

  function isStoreOpen(store) {
    const now = new Date();
    const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
    const today = dayMap[now.getDay()];
    if (!store.days_open?.includes(today)) return false;
    const [oh, om] = store.open_hour.split(':').map(Number);
    const [ch, cm] = store.close_hour.split(':').map(Number);
    const minutes = now.getHours() * 60 + now.getMinutes();
    return minutes >= (oh * 60 + om) && minutes <= (ch * 60 + cm);
  }

  function renderStore({ item }) {
    const open = isStoreOpen(item);
    return (
      <TouchableOpacity
        style={[styles.storeCard, !open && styles.storeCardClosed]}
        onPress={() => open
          ? navigation.navigate('ClientInventory', { store: item, clientLocation: location })
          : Alert.alert(t('clientStores.storeClosed'), t('clientStores.storeClosedMsg', { name: item.store_name }))
        }
      >
        <View style={styles.storeInfo}>
          <Text style={styles.storeName}>{item.store_name}</Text>
          <Text style={styles.storeDistance}>{t('clientStores.kmAway', { distance: item.distance_km.toFixed(1) })}</Text>
          <Text style={styles.storeHours}>
            {item.open_hour} – {item.close_hour}
          </Text>
        </View>
        <View style={styles.storeRight}>
          <View style={[styles.statusBadge, open ? styles.statusOpen : styles.statusClosed]}>
            <Text style={styles.statusBadgeText}>{open ? t('clientStores.open') : t('clientStores.closed')}</Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{t('shared.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('clientStores.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>{t('clientStores.mixingWarning')}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>{t('clientStores.findingStores')}</Text>
        </View>
      ) : stores.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🏪</Text>
          <Text style={styles.emptyText}>{t('clientStores.noStores')}</Text>
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

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' },
  back:               { color: '#2563eb', fontSize: 16, width: 60 },
  headerTitle:        { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  notice:             { backgroundColor: '#fef9c3', padding: 12, borderBottomWidth: 1, borderColor: '#fde047' },
  noticeText:         { fontSize: 13, color: '#713f12', textAlign: 'center' },
  centered:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingText:        { color: '#6b7280', fontSize: 15, marginTop: 12 },
  emptyIcon:          { fontSize: 48, marginBottom: 12 },
  emptyText:          { fontSize: 18, fontWeight: '600', color: '#1a1a1a', marginBottom: 6 },
  emptySubtext:       { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  list:               { padding: 16 },
  storeCard:          { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  storeCardClosed:    { opacity: 0.6 },
  storeInfo:          { flex: 1 },
  storeName:          { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  storeDistance:      { fontSize: 13, color: '#6b7280', marginTop: 3 },
  storeHours:         { fontSize: 13, color: '#6b7280', marginTop: 2 },
  storeRight:         { alignItems: 'center', gap: 8 },
  statusBadge:        { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusOpen:         { backgroundColor: '#dcfce7' },
  statusClosed:       { backgroundColor: '#fee2e2' },
  statusBadgeText:    { fontSize: 12, fontWeight: '600', color: '#374151' },
  arrow:              { fontSize: 22, color: '#9ca3af' },
});
