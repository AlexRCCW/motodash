import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import {
  getDeliveryOrderDetail,
  markOrderReady,
  assignPreferredDriver,
  markDeliveryPaid,
  getReadyPreferredDrivers,
} from '../../services/jobService';
import { t } from '../../i18n';

// ── Status display config ─────────────────────────────────────

const STATUS_CONFIG = {
  pending:          { color: '#d97706', bg: '#fef3c7' },
  accepted:         { color: '#2563eb', bg: '#dbeafe' },
  out_for_delivery: { color: '#7c3aed', bg: '#ede9fe' },
  delivered:        { color: '#16a34a', bg: '#dcfce7' },
  canceled:         { color: '#6b7280', bg: '#f3f4f6' },
  returned:         { color: '#dc2626', bg: '#fee2e2' },
};

// ── Screen ────────────────────────────────────────────────────

export default function StoreOrderDetailScreen({ route, navigation }) {
  const { jobId } = route.params ?? {};
  const { account } = useAuth();

  const [job,              setJob]              = useState(null);
  const [client,           setClient]           = useState(null);
  const [preferredDrivers, setPreferredDrivers] = useState([]);
  const [itemStates,       setItemStates]       = useState({});  // { [idx]: 'pulled'|'unavailable'|null }
  const [loading,          setLoading]          = useState(true);
  const [submitting,       setSubmitting]       = useState(false);
  const [dispatching,      setDispatching]      = useState(false);

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    const { data: jobData, error } = await getDeliveryOrderDetail(jobId);
    if (error || !jobData) { setLoading(false); return; }
    setJob(jobData);

    // Load client account
    if (jobData.client_id) {
      const { data: clientData } = await supabase
        .from('accounts')
        .select('name, phone')
        .eq('id', jobData.client_id)
        .single();
      setClient(clientData);
    }

    // Load ready preferred drivers when order is accepted with no driver yet
    if (jobData.status === 'accepted' && !jobData.driver_id && account?.id) {
      const { data: drivers } = await getReadyPreferredDrivers(account.id);
      setPreferredDrivers(drivers ?? []);
    } else {
      setPreferredDrivers([]);
    }

    setLoading(false);
  }, [jobId, account?.id]);

  useEffect(() => {
    setLoading(true);
    loadJob();

    // Realtime: refresh whenever this job changes
    const channel = supabase
      .channel(`order-detail-${jobId}`)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'delivery_jobs',
        filter: `id=eq.${jobId}`,
      }, () => loadJob())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [loadJob, jobId]);

  // ── Item toggle ─────────────────────────────────────────────

  function toggleItemState(idx, state) {
    setItemStates(prev => ({
      ...prev,
      [idx]: prev[idx] === state ? null : state,
    }));
  }

  // ── Actions ─────────────────────────────────────────────────

  function handleMarkReady() {
    Alert.alert(
      t('storeOrder.readyForDelivery'),
      '',
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.yesMarkReady'),
          onPress: async () => {
            setSubmitting(true);
            const { error } = await markOrderReady(jobId);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
            } else {
              await loadJob();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }

  function handleAssignDriver(driver) {
    Alert.alert(
      t('storeOrder.assignDriver'),
      t('storeOrder.confirmAssign', { name: driver.name }),
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.yesAssign'),
          onPress: async () => {
            setSubmitting(true);
            const { error } = await assignPreferredDriver(jobId, driver.id);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
            } else {
              await loadJob();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }

  function handlePostToPool() {
    // Sets dispatching UI state. The Edge Function (built separately)
    // will read jobs in 'accepted' status with no driver_id and dispatch FCM.
    setDispatching(true);
  }

  function handleMarkPaid() {
    Alert.alert(
      t('storeOrder.markPaid'),
      '',
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.yesMarkPaid'),
          onPress: async () => {
            setSubmitting(true);
            const { error } = await markDeliveryPaid(jobId);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
            } else {
              await loadJob();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }

  // ── Render helpers ───────────────────────────────────────────

  function renderItems(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const isPending = job?.status === 'pending';

    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('storeOrder.items')}</Text>
        {items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>
                {item.name}
                {item.qty > 1 ? <Text style={styles.itemQty}> ×{item.qty}</Text> : null}
              </Text>
              <Text style={styles.itemPrice}>
                ${(Number(item.price) * (item.qty ?? 1)).toFixed(2)}
              </Text>
            </View>
            {isPending && (
              <View style={styles.itemToggles}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    itemStates[idx] === 'pulled' && styles.toggleBtnPulled,
                  ]}
                  onPress={() => toggleItemState(idx, 'pulled')}
                >
                  <Text style={[
                    styles.toggleText,
                    itemStates[idx] === 'pulled' && styles.toggleTextActive,
                  ]}>
                    {t('storeOrder.pulled')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    itemStates[idx] === 'unavailable' && styles.toggleBtnUnavailable,
                  ]}
                  onPress={() => toggleItemState(idx, 'unavailable')}
                >
                  <Text style={[
                    styles.toggleText,
                    itemStates[idx] === 'unavailable' && styles.toggleTextActive,
                  ]}>
                    {t('storeOrder.unavailable')}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  function renderActionArea() {
    if (!job) return null;
    const { status, driver_id, store_paid } = job;

    // ── Pending: store reviews + marks ready ────────────────
    if (status === 'pending') {
      return (
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={handleMarkReady}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>{t('storeOrder.readyForDelivery')}</Text>
          }
        </TouchableOpacity>
      );
    }

    // ── Accepted, no driver yet: assign or post to pool ─────
    if (status === 'accepted' && !driver_id) {
      if (dispatching) {
        return (
          <View style={styles.statusInfoBox}>
            <ActivityIndicator color="#7c3aed" style={{ marginBottom: 8 }} />
            <Text style={styles.statusInfoText}>{t('storeOrder.dispatching')}</Text>
          </View>
        );
      }

      return (
        <View>
          {/* Preferred drivers */}
          {preferredDrivers.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('storeOrder.preferredDrivers')}</Text>
              {preferredDrivers.map(driver => (
                <TouchableOpacity
                  key={driver.id}
                  style={styles.driverRow}
                  onPress={() => handleAssignDriver(driver)}
                  disabled={submitting}
                >
                  <Text style={styles.driverName}>{driver.name}</Text>
                  <View style={styles.assignBadge}>
                    <Text style={styles.assignBadgeText}>{t('storeOrder.assignDriver')}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* No preferred drivers message */}
          {preferredDrivers.length === 0 && (
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>{t('storeOrder.noPreferredDrivers')}</Text>
            </View>
          )}

          {/* Post to pool */}
          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handlePostToPool}
            disabled={submitting}
          >
            <Text style={styles.primaryBtnText}>{t('storeOrder.postToPool')}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // ── Accepted + driver assigned: en route ─────────────────
    if (status === 'accepted' && driver_id) {
      return (
        <View style={[styles.statusInfoBox, { backgroundColor: '#dbeafe' }]}>
          <Text style={[styles.statusInfoText, { color: '#1d4ed8' }]}>
            {t('storeOrder.driverEnRoute')}
          </Text>
        </View>
      );
    }

    // ── Out for delivery: waiting ─────────────────────────────
    if (status === 'out_for_delivery') {
      return (
        <View style={[styles.statusInfoBox, { backgroundColor: '#ede9fe' }]}>
          <Text style={[styles.statusInfoText, { color: '#6d28d9' }]}>
            {t('storeOrder.awaitingDelivery')}
          </Text>
        </View>
      );
    }

    // ── Delivered: mark paid ──────────────────────────────────
    if (status === 'delivered') {
      if (store_paid) {
        return (
          <View style={[styles.statusInfoBox, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.statusInfoText, { color: '#15803d' }]}>
              {t('storeOrder.paid')}
            </Text>
          </View>
        );
      }
      return (
        <TouchableOpacity
          style={[styles.primaryBtn, styles.primaryBtnGreen, submitting && styles.primaryBtnDisabled]}
          onPress={handleMarkPaid}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>{t('storeOrder.markPaid')}</Text>
          }
        </TouchableOpacity>
      );
    }

    return null;
  }

  // ── Loading splash ──────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  const cfg = STATUS_CONFIG[job?.status] ?? STATUS_CONFIG.pending;

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('shared.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('storeOrder.title')}</Text>
        <View style={[styles.headerBadge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.headerBadgeText, { color: cfg.color }]}>
            {t('storeHome.status.' + (job?.status ?? 'pending'))}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Client info */}
        <View style={styles.card}>
          <View style={styles.clientRow}>
            <Text style={styles.cardLabel}>{t('storeOrder.clientName')}</Text>
            <Text style={styles.clientName}>{client?.name ?? '—'}</Text>
          </View>
          {client?.phone && (
            <>
              <View style={styles.clientRow}>
                <Text style={styles.cardLabel}>{t('storeOrder.phone')}</Text>
                <Text style={styles.clientPhone}>{client.phone}</Text>
              </View>
              {job?.status === 'pending' && (
                <Text style={styles.callHint}>
                  {t('storeOrder.callToConfirm', { phone: client.phone })}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Items */}
        {renderItems(job?.items)}

        {/* Notes */}
        {!!job?.order_notes && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('storeOrder.orderNotes')}</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        )}

        {/* Order total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('storeOrder.orderTotal')}</Text>
          <Text style={styles.totalValue}>
            ${job?.order_total != null ? Number(job.order_total).toFixed(2) : '—'}
          </Text>
        </View>

        {/* Action area */}
        <View style={styles.actionArea}>
          {renderActionArea()}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  center:   { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap:               8,
  },
  backBtn:         { paddingRight: 4 },
  backText:        { fontSize: 14, color: '#16a34a', fontWeight: '600' },
  headerTitle:     { flex: 1, fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:      20,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '600' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Card
  card: {
    backgroundColor: '#f9fafb',
    borderRadius:    12,
    padding:         14,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  cardLabel: {
    fontSize:     12,
    fontWeight:   '600',
    color:        '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },

  // Client info
  clientRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   4,
  },
  clientName:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a' },
  clientPhone: { fontSize: 15, color: '#374151' },
  callHint:    { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 18 },

  // Items
  itemRow: { marginBottom: 10 },
  itemInfo: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  itemName:  { fontSize: 14, fontWeight: '500', color: '#1a1a1a', flex: 1 },
  itemQty:   { fontSize: 14, color: '#6b7280', fontWeight: '400' },
  itemPrice: { fontSize: 14, fontWeight: '600', color: '#1a1a1a' },

  // Item state toggles
  itemToggles: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical:    5,
    borderRadius:      8,
    backgroundColor:   '#e5e7eb',
  },
  toggleBtnPulled:      { backgroundColor: '#d1fae5' },
  toggleBtnUnavailable: { backgroundColor: '#fee2e2' },
  toggleText:           { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  toggleTextActive:     { color: '#1a1a1a' },

  // Notes
  notesText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  // Total row
  totalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginTop:       4,
    marginBottom:    16,
  },
  totalLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },

  // Action area
  actionArea: { marginTop: 4 },

  // Info/status boxes
  statusInfoBox: {
    backgroundColor: '#f3f4f6',
    borderRadius:    12,
    padding:         16,
    alignItems:      'center',
  },
  statusInfoText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#374151',
    textAlign:  'center',
  },
  infoBox: {
    backgroundColor: '#f9fafb',
    borderRadius:    10,
    padding:         14,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  infoBoxText: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  // Preferred driver row
  driverRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  driverName: { fontSize: 14, fontWeight: '500', color: '#1a1a1a' },
  assignBadge: {
    backgroundColor:   '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical:    5,
    borderRadius:      8,
  },
  assignBadgeText: { fontSize: 13, fontWeight: '600', color: '#1d4ed8' },

  // Primary action button
  primaryBtn: {
    backgroundColor: '#16a34a',
    borderRadius:    12,
    paddingVertical: 15,
    alignItems:      'center',
    marginTop:       8,
  },
  primaryBtnGreen:    { backgroundColor: '#15803d' },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color:      '#fff',
    fontSize:   15,
    fontWeight: '700',
  },
});
