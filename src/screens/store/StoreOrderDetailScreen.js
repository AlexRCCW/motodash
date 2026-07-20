import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Linking,
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
  dispatchJob,
  notifyAssignedDriver,
  notifyDriverUnassigned,
  unassignDeliveryDriver,
  cancelDeliveryOrder,
} from '../../services/jobService';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import AnimatedPressButton from '../../components/AnimatedPressButton';

// ── Status display config ─────────────────────────────────────

const STATUS_CONFIG = {
  pending:          { color: colors.primary },
  accepted:         { color: colors.textPrimary },
  out_for_delivery: { color: colors.primary },
  delivered:        { color: colors.textPrimary },
  canceled:         { color: colors.textSecondary },
  returned:         { color: colors.primary },
};

// ── Screen ────────────────────────────────────────────────────

export default function StoreOrderDetailScreen({ route, navigation }) {
  const { jobId } = route.params ?? {};
  const { account } = useAuth();

  const [job,              setJob]              = useState(null);
  const [client,           setClient]           = useState(null);
  const [assignedDriver,   setAssignedDriver]   = useState(null);
  const [preferredDrivers, setPreferredDrivers] = useState([]);
  const [itemStates,       setItemStates]       = useState({});  // { [idx]: 'pulled'|'unavailable'|null }
  const [orderTotal,       setOrderTotal]       = useState('');  // editable by store
  const [otherPrices,      setOtherPrices]      = useState({});  // { [idx]: string } for other items
  const [loading,          setLoading]          = useState(true);
  const [submitting,       setSubmitting]       = useState(false);
  const [dispatching,      setDispatching]      = useState(false);
  const [showCancelInput,  setShowCancelInput]  = useState(false);
  const [cancelReason,     setCancelReason]     = useState('');

  const loadJob = useCallback(async () => {
    if (!jobId) return;

    const { data: jobData, error } = await getDeliveryOrderDetail(jobId);
    if (error || !jobData) { setLoading(false); return; }
    setJob(jobData);

    // Pre-populate order total: use existing value, or calculate from items
    if (jobData.order_total != null) {
      setOrderTotal(String(Number(jobData.order_total).toFixed(2)));
    } else if (Array.isArray(jobData.items) && jobData.items.length > 0) {
      const suggested = jobData.items.reduce(
        (sum, item) => sum + Number(item.price) * (item.qty || 1), 0
      );
      setOrderTotal(suggested > 0 ? suggested.toFixed(2) : '');
    }

    // Load client via SECURITY DEFINER RPC — direct accounts query blocked by RLS
    const { data: clientRows } = await supabase
      .rpc('get_order_client', { p_job_id: jobId });
    if (clientRows?.length > 0) {
      setClient({ name: clientRows[0].client_name, phone: clientRows[0].client_phone });
    }

    // Load assigned driver name when one is set
    if (jobData.driver_id) {
      const { data: dp } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', jobData.driver_id)
        .single();
      setAssignedDriver(dp?.name ?? null);
    } else {
      setAssignedDriver(null);
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

  function openClientWhatsApp() {
    const digits = (client?.phone ?? '').replace(/\D/g, '');
    if (!digits) return;
    Linking.openURL(`whatsapp://send?phone=${digits}`).catch(() =>
      Alert.alert('WhatsApp', 'WhatsApp is not installed on this device.')
    );
  }

  function toggleItemState(idx, state) {
    const newStates = {
      ...itemStates,
      [idx]: itemStates[idx] === state ? null : state,
    };
    setItemStates(newStates);

    if (Array.isArray(job?.items)) {
      const newTotal = job.items.reduce((sum, item, i) => {
        if (newStates[i] === 'unavailable') return sum;
        const price = item.isOther
          ? (parseFloat(otherPrices[i]) || 0)
          : Number(item.price);
        return sum + price * (item.qty ?? 1);
      }, 0);
      setOrderTotal(newTotal > 0 ? newTotal.toFixed(2) : '0.00');
    }
  }

  // ── Actions ─────────────────────────────────────────────────

  function handleMarkReady() {
    const total = parseFloat(orderTotal);
    if (isNaN(total) || total <= 0) {
      Alert.alert(t('shared.error'), t('storeOrder.totalRequired'));
      return;
    }
    setSubmitting(true);
    Alert.alert(
      t('storeOrder.readyForDelivery'),
      '',
      [
        { text: t('shared.cancel'), style: 'cancel', onPress: () => setSubmitting(false) },
        {
          text: t('storeOrder.yesMarkReady'),
          onPress: async () => {
            // Build updated items array — inject store prices and unavailable flags
            const updatedItems = (job?.items ?? []).map((item, idx) => {
              const unavailable = itemStates[idx] === 'unavailable';
              if (item.isOther && otherPrices[idx] != null) {
                return { ...item, price: parseFloat(otherPrices[idx]) || 0, unavailable };
              }
              return { ...item, unavailable };
            });
            const { error } = await markOrderReady(jobId, total, updatedItems);
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
      t('storeOrder.confirmAssign', { name: driver.driver_name }),
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.yesAssign'),
          onPress: async () => {
            setSubmitting(true);
            const { data: assigned, error } = await assignPreferredDriver(jobId, driver.id);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
            } else {
              notifyAssignedDriver(jobId, driver.id).catch(e =>
                console.error('notify-driver error:', e)
              );
              await loadJob();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }

  function handleReassign() {
    Alert.alert(
      t('storeOrder.reassignTitle'),
      t('storeOrder.reassignConfirm'),
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('storeOrder.yesReassign'),
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            const previousDriverId = job.driver_id;
            const { error } = await unassignDeliveryDriver(jobId);
            if (error) {
              Alert.alert(t('shared.error'), error.message);
              setSubmitting(false);
              return;
            }
            if (previousDriverId) {
              notifyDriverUnassigned(jobId, previousDriverId).catch(e =>
                console.error('notify-unassign error:', e)
              );
            }
            await loadJob();
            setSubmitting(false);
          },
        },
      ]
    );
  }

  function handlePostToPool() {
    setDispatching(true);
    // Fire-and-forget: Edge Function finds nearby drivers and sends push notifications
    dispatchJob(jobId, 'delivery').catch(e => console.error('dispatch-job error:', e));
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

  function handleCancelOrder() {
    setCancelReason('');
    setShowCancelInput(true);
  }

  async function submitCancelOrder() {
    if (!cancelReason.trim()) {
      Alert.alert(t('shared.error'), t('storeOrder.cancelEnterReason'));
      return;
    }
    setShowCancelInput(false);
    setSubmitting(true);
    const { error } = await cancelDeliveryOrder(jobId, cancelReason.trim());
    if (error) {
      Alert.alert(t('shared.error'), error.message);
    } else {
      await loadJob();
    }
    setSubmitting(false);
    setCancelReason('');
  }

  // ── Render helpers ───────────────────────────────────────────

  function renderItems(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const isPending = job?.status === 'pending';

    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{t('storeOrder.items').toUpperCase()}</Text>
        {items.map((item, idx) => {
          const unavailable = isPending
            ? itemStates[idx] === 'unavailable'
            : !!item.unavailable;
          return (
          <View key={idx} style={[styles.itemRow, unavailable && styles.itemRowUnavailable]}>
            <View style={styles.itemInfo}>
              <Text style={[styles.itemName, unavailable && styles.itemTextUnavailable]}>
                {item.name}
                {item.qty > 1 ? <Text style={styles.itemQty}> ×{item.qty}</Text> : null}
              </Text>
              {unavailable ? (
                <Text style={styles.itemUnavailableLabel}>{t('storeOrder.unavailable').toUpperCase()}</Text>
              ) : (
                <Text style={styles.itemPrice}>
                  ${(Number(item.price) * (item.qty ?? 1)).toFixed(2)}
                </Text>
              )}
            </View>
            {isPending && (
              <View>
                {/* Price input for custom "other" items */}
                {item.isOther && (
                  <View style={styles.otherPriceRow}>
                    <Text style={styles.otherPriceLabel}>{t('storeOrder.storePrice').toUpperCase()}</Text>
                    <TextInput
                      style={styles.otherPriceInput}
                      value={otherPrices[idx] ?? ''}
                      onChangeText={v => {
                        const newPrices = { ...otherPrices, [idx]: v };
                        setOtherPrices(newPrices);
                        if (!Array.isArray(job?.items)) return;
                        const newTotal = job.items.reduce((sum, item, i) => {
                          if (itemStates[i] === 'unavailable') return sum;
                          const price = item.isOther
                            ? (parseFloat(newPrices[i]) || 0)
                            : Number(item.price);
                          return sum + price * (item.qty ?? 1);
                        }, 0);
                        setOrderTotal(newTotal > 0 ? newTotal.toFixed(2) : '0.00');
                      }}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.textSecondary}
                    />
                  </View>
                )}
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
                      {t('storeOrder.pulled').toUpperCase()}
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
                      {t('storeOrder.unavailable').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
          );
        })}
      </View>
    );
  }

  function renderActionArea() {
    if (!job) return null;
    const { status, driver_id, store_paid } = job;

    // ── Pending: store reviews + marks ready ────────────────
    if (status === 'pending') {
      return (
        <View style={{ gap: 10 }}>
          <AnimatedPressButton
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleMarkReady}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={colors.onDark} />
              : <Text style={styles.primaryBtnText}>{t('storeOrder.readyForDelivery').toUpperCase()}</Text>
            }
          </AnimatedPressButton>
          <AnimatedPressButton
            style={[styles.cancelOrderBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleCancelOrder}
            disabled={submitting}
          >
            <Text style={styles.cancelOrderBtnText}>{t('storeOrder.cancelOrder').toUpperCase()}</Text>
          </AnimatedPressButton>
        </View>
      );
    }

    // ── Accepted, no driver yet: assign or post to pool ─────
    if (status === 'accepted' && !driver_id) {
      if (dispatching) {
        return (
          <View style={styles.statusInfoBox}>
            <ActivityIndicator color={colors.primary} style={{ marginBottom: 8 }} />
            <Text style={styles.statusInfoText}>{t('storeOrder.dispatching').toUpperCase()}</Text>
          </View>
        );
      }

      return (
        <View>
          {/* Preferred drivers — all shown, availability reflected */}
          {preferredDrivers.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardLabel}>{t('storeOrder.preferredDrivers').toUpperCase()}</Text>
              {preferredDrivers.map(driver => {
                const avail     = driver.availability ?? 'offline';
                const canAssign = avail === 'available' && !submitting;
                const availStyle = avail === 'available'
                  ? styles.availBadgeGreen
                  : avail === 'on_job'
                  ? styles.availBadgeAmber
                  : styles.availBadgeGray;
                const availLabel = avail === 'available'
                  ? t('storeOrder.driverAvailable')
                  : avail === 'on_job'
                  ? t('storeOrder.driverOnJob')
                  : t('storeOrder.driverOffline');

                return (
                  <View
                    key={driver.id}
                    style={[styles.driverRow, !canAssign && styles.driverRowDimmed]}
                  >
                    <View style={styles.driverLeft}>
                      <Text style={styles.driverName}>{driver.driver_name}</Text>
                      <View style={[styles.availBadge, availStyle]}>
                        <Text style={styles.availBadgeText}>{availLabel.toUpperCase()}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[styles.assignBadge, !canAssign && styles.assignBadgeDimmed]}
                      onPress={() => canAssign && handleAssignDriver(driver)}
                      disabled={!canAssign}
                    >
                      <Text style={styles.assignBadgeText}>{t('storeOrder.assignDriver').toUpperCase()}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* No preferred drivers message */}
          {preferredDrivers.length === 0 && (
            <View style={styles.infoBox}>
              <Text style={styles.infoBoxText}>{t('storeOrder.noPreferredDrivers')}</Text>
            </View>
          )}

          {/* Post to pool */}
          <AnimatedPressButton
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handlePostToPool}
            disabled={submitting}
          >
            <Text style={styles.primaryBtnText}>{t('storeOrder.postToPool').toUpperCase()}</Text>
          </AnimatedPressButton>

          {/* Cancel — available until driver picks up */}
          <AnimatedPressButton
            style={[styles.cancelOrderBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleCancelOrder}
            disabled={submitting}
          >
            <Text style={styles.cancelOrderBtnText}>{t('storeOrder.cancelOrder').toUpperCase()}</Text>
          </AnimatedPressButton>
        </View>
      );
    }

    // ── Accepted + driver assigned: en route ─────────────────
    if (status === 'accepted' && driver_id) {
      return (
        <View style={{ gap: 10 }}>
          <View style={styles.statusInfoBox}>
            <Text style={styles.statusInfoText}>{t('storeOrder.driverEnRoute').toUpperCase()}</Text>
          </View>
          <AnimatedPressButton
            style={[styles.cancelOrderBtn, submitting && styles.primaryBtnDisabled]}
            onPress={handleReassign}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.cancelOrderBtnText}>
                  {t('storeOrder.reassignDriver').toUpperCase()}
                </Text>
            }
          </AnimatedPressButton>
        </View>
      );
    }

    // ── Out for delivery: waiting ─────────────────────────────
    if (status === 'out_for_delivery') {
      return (
        <View style={styles.statusInfoBox}>
          <Text style={styles.statusInfoText}>{t('storeOrder.awaitingDelivery').toUpperCase()}</Text>
        </View>
      );
    }

    // ── Delivered: mark paid ──────────────────────────────────
    if (status === 'delivered') {
      if (store_paid) {
        return (
          <View style={[styles.statusInfoBox, { borderLeftColor: colors.primary }]}>
            <Text style={[styles.statusInfoText, { color: colors.primary }]}>
              {t('storeOrder.paid').toUpperCase()}
            </Text>
          </View>
        );
      }
      return (
        <AnimatedPressButton
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={handleMarkPaid}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={colors.onDark} />
            : <Text style={styles.primaryBtnText}>{t('storeOrder.markPaid').toUpperCase()}</Text>
          }
        </AnimatedPressButton>
      );
    }

    return null;
  }

  // ── Loading splash ──────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.hero} edges={['top']}>
          <View style={styles.heroHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.heroBackBtn}>
              <Text style={styles.heroBackText}>{t('shared.back').toUpperCase()}</Text>
            </TouchableOpacity>
            <Text style={styles.heroTitle}>{t('storeOrder.title').toUpperCase()}</Text>
            <View style={{ width: 60 }} />
          </View>
        </SafeAreaView>
        <SlashDivider />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  const cfg = STATUS_CONFIG[job?.status] ?? STATUS_CONFIG.pending;

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.heroBackBtn}>
            <Text style={styles.heroBackText}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{t('storeOrder.title').toUpperCase()}</Text>
          <Text style={[styles.heroBadge, { color: cfg.color }]}>
            {t('storeHome.status.' + (job?.status ?? 'pending')).toUpperCase()}
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Order ID */}
        <View style={styles.orderIdRow}>
          <Text style={styles.orderIdLabel}>{t('storeOrder.orderLabel').toUpperCase()}</Text>
          <Text style={styles.orderIdValue}>#{job.id.slice(-8).toUpperCase()}</Text>
        </View>

        {/* Client info */}
        <View style={styles.card}>
          <View style={styles.clientRow}>
            <Text style={styles.cardLabel}>{t('storeOrder.clientName').toUpperCase()}</Text>
            <Text style={styles.clientName}>{client?.name ?? '—'}</Text>
          </View>
          {client?.phone && (
            <>
              <View style={styles.clientRow}>
                <Text style={styles.cardLabel}>{t('storeOrder.phone').toUpperCase()}</Text>
                <TouchableOpacity onPress={openClientWhatsApp}>
                  <Text style={[styles.clientPhone, styles.clientPhoneLink]}>{client.phone}</Text>
                </TouchableOpacity>
              </View>
              {job?.status === 'pending' && (
                <Text style={styles.callHint}>
                  {t('storeOrder.callToConfirm', { phone: client.phone })}
                </Text>
              )}
            </>
          )}
          {assignedDriver && (
            <View style={[styles.clientRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Text style={styles.cardLabel}>{t('storeOrder.driver').toUpperCase()}</Text>
              <Text style={styles.clientName}>{assignedDriver}</Text>
            </View>
          )}
        </View>

        {/* Items */}
        {renderItems(job?.items)}

        {/* Notes */}
        {!!job?.order_notes && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('storeOrder.orderNotes').toUpperCase()}</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        )}

        {/* Order total — editable by store when pending, read-only after */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('storeOrder.orderTotal').toUpperCase()}</Text>
          {job?.status === 'pending' ? (
            <TextInput
              style={styles.totalInput}
              value={orderTotal}
              onChangeText={setOrderTotal}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
            />
          ) : (
            <Text style={styles.totalValue}>
              ${job?.order_total != null ? Number(job.order_total).toFixed(2) : '—'}
            </Text>
          )}
        </View>

        {/* Inline cancel reason input */}
        {showCancelInput && (
          <View style={styles.cancelInputCard}>
            <Text style={styles.cancelInputLabel}>
              {t('storeOrder.cancelReasonTitle')}
            </Text>
            <TextInput
              style={styles.cancelInputField}
              placeholder={t('storeOrder.cancelReasonPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={cancelReason}
              onChangeText={setCancelReason}
              multiline
              autoFocus
            />
            <View style={styles.cancelInputRow}>
              <AnimatedPressButton
                style={styles.cancelInputDismiss}
                onPress={() => setShowCancelInput(false)}
              >
                <Text style={styles.cancelInputDismissText}>
                  {t('shared.cancel').toUpperCase()}
                </Text>
              </AnimatedPressButton>
              <AnimatedPressButton
                style={styles.cancelInputConfirm}
                onPress={submitCancelOrder}
              >
                <Text style={styles.cancelInputConfirmText}>
                  {(t('storeOrder.yesCancelOrder') || 'Cancel Order').toUpperCase()}
                </Text>
              </AnimatedPressButton>
            </View>
          </View>
        )}

        {/* Action area */}
        <View style={styles.actionArea}>
          {renderActionArea()}
        </View>

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  center:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingTop:        10,
    paddingBottom:     4,
    gap:               8,
  },
  heroBackBtn:  { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: '#ffffff', letterSpacing: 1.5 },
  heroTitle:    { flex: 1, fontSize: 14, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroBadge:    { fontSize: 10, fontWeight: '500', letterSpacing: 1.5, color: colors.mutedOnDark },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  orderIdRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   12,
  },
  orderIdLabel: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    letterSpacing:  1.5,
  },
  orderIdValue: {
    fontSize:      13,
    fontWeight:    '600',
    color:         colors.textPrimary,
    letterSpacing:  1,
    fontVariant:   ['tabular-nums'],
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         14,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  cardLabel: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing:  1.5,
    marginBottom:  6,
  },

  // Client info
  clientRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   4,
  },
  clientName:  { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  clientPhone:     { fontSize: 15, color: colors.textPrimary },
  clientPhoneLink: { color: colors.primary, textDecorationLine: 'underline' },
  callHint:    { fontSize: 13, color: colors.textSecondary, marginTop: 8, lineHeight: 18 },

  // Items
  itemRow: { marginBottom: 10 },
  itemRowUnavailable: { opacity: 0.4 },
  itemTextUnavailable: { textDecorationLine: 'line-through', color: colors.textSecondary },
  itemUnavailableLabel: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    letterSpacing:  1,
    textTransform: 'uppercase',
  },
  itemInfo: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  itemName:  { fontSize: 14, fontWeight: '500', color: colors.textPrimary, flex: 1 },
  itemQty:   { fontSize: 14, color: colors.textSecondary, fontWeight: '400' },
  itemPrice: { fontSize: 14, fontWeight: '500', color: colors.primary },

  // Item state toggles
  itemToggles: { flexDirection: 'row', gap: 8 },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:      radius.sm,
    backgroundColor:   colors.border,
  },
  toggleBtnPulled:      { backgroundColor: colors.primary },
  toggleBtnUnavailable: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  toggleText: {
    fontSize:      10,
    fontWeight:    '500',
    color:         colors.textSecondary,
    letterSpacing:  1,
    textTransform: 'uppercase',
  },
  toggleTextActive: { color: colors.onDark },

  // Notes
  notesText: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },

  // Total row
  totalRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop:       4,
    marginBottom:    16,
  },
  totalLabel: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  totalValue: { fontSize: 18, fontWeight: '500', color: colors.primary },
  totalInput: {
    fontSize:          18,
    fontWeight:        '500',
    color:             colors.primary,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical:    2,
    paddingHorizontal:  4,
    minWidth:           80,
    textAlign:         'right',
  },

  // Action area
  actionArea: { marginTop: 4 },

  // Info/status boxes
  statusInfoBox: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    padding:         16,
    alignItems:      'center',
  },
  statusInfoText: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    textAlign:     'center',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         14,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     colors.border,
  },
  infoBoxText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },

  // Preferred driver row
  driverRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  driverRowDimmed: { opacity: 0.45 },
  driverLeft:  { flex: 1, marginRight: 10, gap: 4 },
  driverName:  { fontSize: 14, fontWeight: '500', color: colors.textPrimary },

  // Availability badges
  availBadge: {
    alignSelf:         'flex-start',
    paddingHorizontal: 7,
    paddingVertical:    2,
    borderRadius:      radius.sm,
  },
  availBadgeGreen: { backgroundColor: '#dcfce7' },
  availBadgeAmber: { backgroundColor: '#fef3c7' },
  availBadgeGray:  { backgroundColor: colors.surface },
  availBadgeText: {
    fontSize:      9,
    fontWeight:    '500',
    letterSpacing:  1.2,
    textTransform: 'uppercase',
    color:         colors.textPrimary,
  },

  // Assign button
  assignBadge: {
    backgroundColor:   colors.primary,
    paddingHorizontal: 10,
    paddingVertical:    6,
    borderRadius:      radius.sm,
  },
  assignBadgeDimmed: { backgroundColor: colors.border },
  assignBadgeText: {
    fontSize:      10,
    fontWeight:    '500',
    color:         colors.onDark,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  // Other item price row
  otherPriceRow: {
    flexDirection: 'row',
    alignItems:    'center',
    marginBottom:   8,
    gap:            8,
  },
  otherPriceLabel: {
    fontSize:      10,
    color:         colors.textSecondary,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  otherPriceInput: {
    flex:              1,
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.sm,
    paddingHorizontal: 10,
    paddingVertical:    6,
    fontSize:          14,
    color:             colors.textPrimary,
    backgroundColor:   colors.background,
  },

  // Inline cancel reason input
  cancelInputCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         14,
    marginBottom:    12,
  },
  cancelInputLabel: {
    fontSize:      12,
    fontWeight:    '600',
    color:         colors.textSecondary,
    letterSpacing:  1,
    textTransform: 'uppercase',
    marginBottom:   8,
  },
  cancelInputField: {
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.sm,
    padding:           10,
    fontSize:          14,
    color:             colors.textPrimary,
    backgroundColor:   colors.background,
    minHeight:         60,
    textAlignVertical: 'top',
    marginBottom:      10,
  },
  cancelInputRow:         { flexDirection: 'row', gap: 8 },
  cancelInputDismiss: {
    flex:            1,
    paddingVertical: 11,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.sm,
  },
  cancelInputDismissText: {
    fontSize:      11,
    fontWeight:    '600',
    color:         colors.textSecondary,
    letterSpacing:  1.5,
  },
  cancelInputConfirm: {
    flex:            2,
    paddingVertical: 11,
    alignItems:      'center',
    backgroundColor: colors.primary,
    borderRadius:    radius.sm,
  },
  cancelInputConfirmText: {
    fontSize:      11,
    fontWeight:    '600',
    color:         colors.onDark,
    letterSpacing:  1.5,
  },

  // Cancel order button
  cancelOrderBtn: {
    borderWidth:     1.5,
    borderColor:    colors.primary,
    borderRadius:   radius.md,
    paddingVertical: 14,
    alignItems:     'center',
  },
  cancelOrderBtnText: {
    color:         colors.primary,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
    textTransform: 'uppercase',
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 15,
    alignItems:      'center',
    marginTop:       8,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
});
