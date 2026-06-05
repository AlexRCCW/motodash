import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import {
  getOpenDeliveryOrders,
  getClosedDeliveryOrders,
  hasOutOfStockItems,
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

function formatOrderTime(iso) {
  const d   = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Screen ────────────────────────────────────────────────────

export default function StoreHomeScreen({ navigation }) {
  const { account } = useAuth();
  const [openOrders,   setOpenOrders]   = useState([]);
  const [closedOrders, setClosedOrders] = useState([]);
  const [outOfStock,   setOutOfStock]   = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  const loadData = useCallback(async () => {
    if (!account?.id) return;
    const [openRes, closedRes, stockRes] = await Promise.all([
      getOpenDeliveryOrders(account.id),
      getClosedDeliveryOrders(account.id),
      hasOutOfStockItems(account.id),
    ]);
    if (openRes.data)   setOpenOrders(openRes.data);
    if (closedRes.data) setClosedOrders(closedRes.data);
    setOutOfStock(stockRes.hasOutOfStock ?? false);
    setLoading(false);
    setRefreshing(false);
  }, [account?.id]);

  // Reload on screen focus + subscribe to realtime changes
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();

      const channel = supabase
        .channel(`store-orders-${account?.id}`)
        .on('postgres_changes', {
          event:  '*',
          schema: 'public',
          table:  'delivery_jobs',
          filter: `store_id=eq.${account?.id}`,
        }, () => loadData())
        .subscribe();

      return () => supabase.removeChannel(channel);
    }, [loadData, account?.id])
  );

  function handleSignOut() {
    Alert.alert(
      t('auth.signOut'),
      '',
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text:  t('auth.signOut'),
          style: 'destructive',
          onPress: () => supabase.auth.signOut(),
        },
      ]
    );
  }

  // ── Order card ──────────────────────────────────────────────

  function renderOrderCard(order) {
    const cfg        = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
    const itemCount  = Array.isArray(order.items) ? order.items.length : 0;
    const total      = order.order_total != null
      ? `$${Number(order.order_total).toFixed(2)}`
      : '—';
    const countLabel = itemCount === 1
      ? t('clientInventory.itemCount',       { count: itemCount })
      : t('clientInventory.itemCountPlural', { count: itemCount });

    return (
      <TouchableOpacity
        key={order.id}
        style={styles.orderCard}
        onPress={() => navigation.navigate('StoreOrderDetail', { jobId: order.id })}
        activeOpacity={0.75}
      >
        <View style={styles.cardRow}>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>
              {t('storeHome.status.' + order.status)}
            </Text>
          </View>
          <Text style={styles.orderTotal}>{total}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.orderMeta}>{countLabel}</Text>
          <Text style={styles.orderMeta}>{formatOrderTime(order.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
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

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('storeHome.title')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('StoreItems')}
          >
            <Text style={styles.headerBtnText}>{t('storeHome.items')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Instructions')}
          >
            <Text style={styles.headerBtnText}>{t('storeHome.help')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerBtn, styles.headerBtnDanger]}
            onPress={handleSignOut}
          >
            <Text style={[styles.headerBtnText, styles.headerBtnTextDanger]}>
              {t('auth.signOut')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Out-of-stock banner — tappable, navigates to items */}
      {outOfStock && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => navigation.navigate('StoreItems')}
          activeOpacity={0.8}
        >
          <Text style={styles.alertBannerText}>{t('storeHome.outOfStockAlert')}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor="#16a34a"
          />
        }
      >
        {/* Open orders section */}
        <Text style={styles.sectionTitle}>{t('storeHome.openOrders')}</Text>
        {openOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('storeHome.noOpenOrders')}</Text>
          </View>
        ) : (
          openOrders.map(renderOrderCard)
        )}

        {/* Closed orders section */}
        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
          {t('storeHome.closedOrders')}
        </Text>
        {closedOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('storeHome.noClosedOrders')}</Text>
          </View>
        ) : (
          closedOrders.map(renderOrderCard)
        )}
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
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle:         { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  headerActions:       { flexDirection: 'row', gap: 8 },
  headerBtn: {
    paddingHorizontal: 10,
    paddingVertical:   6,
    borderRadius:      8,
    backgroundColor:   '#f3f4f6',
  },
  headerBtnDanger:     { backgroundColor: '#fee2e2' },
  headerBtnText:       { fontSize: 13, fontWeight: '600', color: '#374151' },
  headerBtnTextDanger: { color: '#dc2626' },

  // Out-of-stock banner
  alertBanner: {
    backgroundColor:   '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: '#fde68a',
  },
  alertBannerText: { fontSize: 13, fontWeight: '500', color: '#92400e' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Sections
  sectionTitle:  { fontSize: 16, fontWeight: '700', color: '#1a1a1a', marginBottom: 10 },
  sectionSpaced: { marginTop: 28 },

  // Empty state
  emptyCard: {
    backgroundColor: '#f9fafb',
    borderRadius:    12,
    padding:         20,
    alignItems:      'center',
  },
  emptyText: { fontSize: 14, color: '#9ca3af' },

  // Order card
  orderCard: {
    backgroundColor: '#f9fafb',
    borderRadius:    12,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  cardRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:      20,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  orderTotal: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  orderMeta:  { fontSize: 12, color: '#6b7280' },
});
