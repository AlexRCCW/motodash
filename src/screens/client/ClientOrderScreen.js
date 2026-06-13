import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { markDeliveryCompleteClient } from '../../services/jobService';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import { showInterstitial } from '../../services/adService';

const STATUS_CONFIG = {
  pending:          { color: colors.primary,      bg: colors.surface },
  accepted:         { color: colors.textPrimary,  bg: colors.surface },
  out_for_delivery: { color: colors.primary,      bg: colors.surface },
  delivered:        { color: colors.textPrimary,  bg: colors.surface },
  canceled:         { color: colors.primary,      bg: colors.surface },
  returned:         { color: colors.textSecondary,bg: colors.surface },
};

export default function ClientOrderScreen({ navigation, route }) {
  const { account } = useAuth();
  const { store, clientLocation, orderItems, job: resumedJob } = route.params || {};

  const [notes,       setNotes]       = useState('');
  const [placing,     setPlacing]     = useState(false);
  const [job,         setJob]         = useState(resumedJob || null);
  const [storeName,   setStoreName]   = useState(store?.store_name ?? '');
  const [completing,     setCompleting]     = useState(false);
  const [adShownWaiting, setAdShownWaiting] = useState(false);

  const isPlaced = !!job;

  // Fetch store name when resuming (store param won't be present)
  useEffect(() => {
    const sid = job?.store_id ?? store?.id;
    if (sid && !storeName) {
      supabase
        .from('store_profiles')
        .select('store_name')
        .eq('id', sid)
        .single()
        .then(({ data }) => { if (data) setStoreName(data.store_name); });
    }
  }, [job?.store_id, store?.id]);

  // Realtime subscription to order status changes
  useEffect(() => {
    if (!job?.id) return;
    const channel = supabase
      .channel(`delivery_job_${job.id}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'delivery_jobs',
        filter: `id=eq.${job.id}`,
      }, payload => {
        setJob(payload.new);
        if (payload.new.status === 'out_for_delivery' && !adShownWaiting) {
          setAdShownWaiting(true);
          showInterstitial();
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [job?.id]);

  // ── Order flow ───────────────────────────────────────────────

  async function handlePlaceOrder() {
    if (!store || !clientLocation || !orderItems?.length) return;
    await showInterstitial();
    await doPlaceOrder();
  }

  async function doPlaceOrder() {
    setPlacing(true);
    const { data, error } = await supabase
      .from('delivery_jobs')
      .insert({
        client_id:   account.id,
        client_lat:  clientLocation.lat,
        client_lng:  clientLocation.lng,
        store_id:    store.id,
        store_lat:   store.location_lat,
        store_lng:   store.location_lng,
        items:       orderItems,
        order_notes: notes,
        status:      'pending',
      })
      .select()
      .single();
    setPlacing(false);

    if (error || !data) {
      Alert.alert(t('shared.error'), t('clientOrder.placeOrderError'));
      return;
    }

    setJob(data);
    await AsyncStorage.setItem('open_job', 'true');
    await AsyncStorage.setItem('open_job_type', 'delivery');
    await AsyncStorage.setItem('open_job_id', data.id);
  }

  async function handleMarkReceived() {
    setCompleting(true);
    await showInterstitial();
    const { error } = await markDeliveryCompleteClient(job.id);
    if (error) {
      Alert.alert(t('shared.error'), t('clientOrder.completeOrderError'),
        [{ text: t('shared.retry'), onPress: () => handleMarkReceived() }]
      );
      setCompleting(false);
      return;
    }
    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
    navigation.replace('ClientHome');
  }

  const currentStyle = STATUS_CONFIG[job?.status] || STATUS_CONFIG.pending;
  const allItems     = orderItems || job?.items || [];

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <TouchableOpacity onPress={() => !isPlaced && navigation.goBack()} style={styles.heroBackBtn}>
            <Text style={[styles.heroBackText, isPlaced && { opacity: 0 }]}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>
            {(isPlaced ? t('clientOrder.orderStatus') : t('clientOrder.reviewOrder')).toUpperCase()}
          </Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      <ScrollView contentContainerStyle={styles.content}>

        {/* Store name */}
        <View style={styles.storeRow}>
          <Text style={styles.storeLabel}>{t('clientOrder.store').toUpperCase()}</Text>
          <Text style={styles.storeName}>{storeName || '—'}</Text>
        </View>

        {/* Status badge */}
        {isPlaced && (
          <View style={[styles.statusBadge, { backgroundColor: currentStyle.bg }]}>
            <Text style={[styles.statusText, { color: currentStyle.color }]}>
              {t('clientOrder.status.' + (job?.status || 'pending')).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Cancel reason */}
        {isPlaced && job?.status === 'canceled' && job?.cancel_reason && (
          <View style={styles.cancelReasonBox}>
            <Text style={styles.cancelReasonTitle}>{t('clientOrder.canceledByStore').toUpperCase()}</Text>
            <Text style={styles.cancelReasonText}>
              {t('clientOrder.cancelReason', { reason: job.cancel_reason })}
            </Text>
          </View>
        )}

        {/* Map */}
        {isPlaced && job?.store_lat && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude:      job.store_lat,
                longitude:     job.store_lng,
                latitudeDelta:  0.02,
                longitudeDelta: 0.02,
              }}
            >
              <Marker
                coordinate={{ latitude: job.store_lat, longitude: job.store_lng }}
                title={storeName || 'Store'}
                pinColor={colors.textPrimary}
              />
              {job.client_lat && (
                <Marker
                  coordinate={{ latitude: job.client_lat, longitude: job.client_lng }}
                  title="You"
                  pinColor={colors.primary}
                />
              )}
            </MapView>
          </View>
        )}

        {/* Order items */}
        <Text style={styles.sectionTitle}>{t('clientOrder.orderItems').toUpperCase()}</Text>
        {allItems.map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <View style={styles.itemNameCol}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.isOther && (
                <Text style={styles.itemCustomTag}>{t('storeOrder.customItem').toUpperCase()}</Text>
              )}
            </View>
            <Text style={styles.itemQty}>×{item.qty}</Text>
            <Text style={[styles.itemPrice, item.isOther && item.price === 0 && styles.itemPriceTBD]}>
              {item.isOther && item.price === 0
                ? t('clientInventory.otherItemTBD')
                : `$${(Number(item.price) * item.qty).toFixed(2)}`}
            </Text>
          </View>
        ))}

        {/* Notes input (pre-order) */}
        {!isPlaced && (
          <>
            <Text style={styles.sectionTitle}>{t('clientOrder.deliveryNotes').toUpperCase()}</Text>
            <TextInput
              style={styles.notesInput}
              placeholder={t('clientOrder.deliveryNotesPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
            <Text style={styles.phoneNote}>
              {t('clientOrder.phoneNote', { phone: account?.phone })}
            </Text>
          </>
        )}

        {/* Notes display (post-order) */}
        {isPlaced && job?.order_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>{t('clientOrder.deliveryNotes').toUpperCase()}</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        ) : null}

        {/* Order total */}
        {isPlaced && job?.order_total ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{t('clientOrder.orderTotal').toUpperCase()}</Text>
            <Text style={styles.totalValue}>${Number(job.order_total).toFixed(2)}</Text>
          </View>
        ) : null}

      </ScrollView>

      {/* Footer actions */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        {!isPlaced && (
          <TouchableOpacity
            style={[styles.primaryBtn, placing && styles.primaryBtnDisabled]}
            onPress={handlePlaceOrder}
            disabled={placing}
          >
            {placing
              ? <ActivityIndicator color={colors.onDark} />
              : <Text style={styles.primaryBtnText}>{t('clientOrder.placeOrder').toUpperCase()}</Text>
            }
          </TouchableOpacity>
        )}

        {isPlaced && job?.status === 'out_for_delivery' && (
          <TouchableOpacity
            style={[styles.primaryBtn, completing && styles.primaryBtnDisabled]}
            onPress={handleMarkReceived}
            disabled={completing}
          >
            <Text style={styles.primaryBtnText}>{t('clientOrder.markReceived').toUpperCase()}</Text>
          </TouchableOpacity>
        )}

        {isPlaced && !['out_for_delivery', 'delivered', 'canceled', 'returned'].includes(job?.status) && (
          <View style={styles.waitingPanel}>
            <Text style={styles.waitingText}>
              {job?.status === 'pending'
                ? t('clientOrder.waitingConfirm').toUpperCase()
                : t('clientOrder.orderConfirmed').toUpperCase()}
            </Text>
          </View>
        )}

        {/* Canceled / returned — let the customer go home */}
        {isPlaced && ['canceled', 'returned'].includes(job?.status) && (
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
              navigation.replace('ClientHome');
            }}
          >
            <Text style={styles.secondaryBtnText}>{t('clientOrder.backToHome').toUpperCase()}</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
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
  heroTitle:    { fontSize: 13, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroBackBtn:  { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: colors.mutedOnDark, letterSpacing: 1.5 },

  content: { padding: 16, paddingBottom: 24 },

  storeRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  storeLabel:{
    fontSize:      11,
    color:         colors.textSecondary,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  storeName: { fontSize: 15, fontWeight: '500', color: colors.textPrimary, flexShrink: 1, textAlign: 'right', maxWidth: '70%' },

  statusBadge: {
    borderRadius:    radius.sm,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         12,
    marginBottom:    16,
  },
  statusText: {
    fontWeight:    '500',
    fontSize:      11,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  // Cancel reason box
  cancelReasonBox: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         14,
    marginBottom:    16,
  },
  cancelReasonTitle: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.primary,
    marginBottom:   4,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  cancelReasonText:  { fontSize: 14, color: colors.textPrimary },

  mapContainer:{ height: 160, borderRadius: radius.md, overflow: 'hidden', marginBottom: 16 },
  map:         { flex: 1 },

  sectionTitle: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing:  1.5,
    marginBottom:  10,
    marginTop:     8,
  },

  // Items
  itemRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
  itemNameCol:{ flex: 1 },
  itemName:   { fontSize: 15, color: colors.textPrimary },
  itemCustomTag: {
    fontSize:      10,
    color:         colors.primary,
    fontWeight:    '500',
    marginTop:     2,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  itemQty:    { fontSize: 14, color: colors.textSecondary, marginRight: 12 },
  itemPrice:  { fontSize: 15, fontWeight: '500', color: colors.primary },
  itemPriceTBD: { color: colors.textSecondary },

  notesInput: {
    borderWidth:      1,
    borderColor:      colors.border,
    borderRadius:     radius.md,
    padding:          12,
    fontSize:         15,
    color:            colors.textPrimary,
    textAlignVertical:'top',
    minHeight:        80,
    marginBottom:     12,
    backgroundColor:  colors.surface,
  },
  phoneNote: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 8 },
  notesBox:  {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         12,
    marginTop:       8,
  },
  notesLabel: {
    fontSize:      11,
    color:         colors.textSecondary,
    fontWeight:    '500',
    textTransform: 'uppercase',
    letterSpacing:  1.5,
  },
  notesText: { fontSize: 14, color: colors.textPrimary, marginTop: 4 },

  totalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:      16,
    paddingTop:     16,
    borderTopWidth: 2,
    borderColor:    colors.border,
  },
  totalLabel: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  totalValue: { fontSize: 20, fontWeight: '500', color: colors.primary },

  footer: {
    padding:         16,
    paddingBottom:   12,
    borderTopWidth:  1,
    borderColor:     colors.border,
    backgroundColor: colors.background,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  secondaryBtn: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    paddingVertical: 16,
    alignItems:      'center',
  },
  secondaryBtnText: {
    color:         colors.textPrimary,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  waitingPanel: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
    alignItems:      'center',
  },
  waitingText: {
    color:         colors.textSecondary,
    fontSize:      11,
    textAlign:     'center',
    letterSpacing:  1.5,
    fontWeight:    '500',
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
