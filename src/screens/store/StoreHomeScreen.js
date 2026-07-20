import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Image,
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
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

// ── Status display config ─────────────────────────────────────

const STATUS_CONFIG = {
  pending:          { color: colors.primary },
  accepted:         { color: colors.textPrimary },
  out_for_delivery: { color: colors.primary },
  delivered:        { color: colors.textPrimary },
  canceled:         { color: colors.textSecondary },
  returned:         { color: colors.primary },
};

function formatOrderTime(iso) {
  const d   = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
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
          <Text style={[styles.statusText, { color: cfg.color }]}>
            {t('storeHome.status.' + order.status).toUpperCase()}
          </Text>
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
      <View style={styles.root}>
        <SafeAreaView style={styles.hero} edges={['top']}>
          <Image source={require('../../../assets/app-logoV2.png')} style={styles.headerLogo} resizeMode="contain" />
        </SafeAreaView>
        <SlashDivider />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <Image source={require('../../../assets/app-logoV2.png')} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => navigation.navigate('StoreItems')}
          >
            <Text style={styles.heroBtnText}>{t('storeHome.items').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => navigation.navigate('StoreDrivers')}
          >
            <Text style={styles.heroBtnText}>{t('storeHome.drivers').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => navigation.navigate('StoreProfile')}
          >
            <Text style={styles.heroBtnText}>{(t('storeHome.profile') ?? 'PROFILE').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroBtn}
            onPress={() => navigation.navigate('Instructions')}
          >
            <Text style={styles.heroBtnText}>{t('storeHome.help').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroBtn, styles.heroBtnRed]}
            onPress={handleSignOut}
          >
            <Text style={[styles.heroBtnText, styles.heroBtnRedText]}>
              {t('auth.signOut').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {/* Out-of-stock banner — tappable, navigates to items */}
      {outOfStock && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => navigation.navigate('StoreItems')}
          activeOpacity={0.8}
        >
          <Text style={styles.alertBannerText}>{t('storeHome.outOfStockAlert').toUpperCase()}</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadData(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Open orders section */}
        <Text style={styles.sectionTitle}>{t('storeHome.openOrders').toUpperCase()}</Text>
        {openOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('storeHome.noOpenOrders').toUpperCase()}</Text>
          </View>
        ) : (
          openOrders.map(renderOrderCard)
        )}

        {/* Closed orders section */}
        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>
          {t('storeHome.closedOrders').toUpperCase()}
        </Text>
        {closedOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('storeHome.noClosedOrders').toUpperCase()}</Text>
          </View>
        ) : (
          closedOrders.map(renderOrderCard)
        )}
      </ScrollView>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  center:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  headerLogo: {
    width:        220,
    height:        50,
    alignSelf:    'center',
    marginBottom:  10,
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  heroBtn: {
    paddingHorizontal: 9,
    paddingVertical:   5,
    borderRadius:      radius.sm,
    backgroundColor:  'rgba(255,255,255,0.07)',
  },
  heroBtnText:    { fontSize: 10, fontWeight: '500', color: '#ffffff', letterSpacing: 1.5 },
  heroBtnRed:     { backgroundColor: 'rgba(192,57,43,0.18)' },
  heroBtnRedText: { color: colors.primary },

  // Out-of-stock banner
  alertBanner: {
    backgroundColor:   colors.surface,
    paddingHorizontal: 16,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth:   4,
    borderLeftColor:   colors.primary,
  },
  alertBannerText: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.primary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Sections
  sectionTitle: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    marginBottom:  10,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  sectionSpaced: { marginTop: 28 },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         20,
    alignItems:      'center',
  },
  emptyText: {
    fontSize:      11,
    color:         colors.textSecondary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
    fontWeight:    '500',
  },

  // Order card
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  cardRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   6,
  },
  statusText: {
    fontSize:      11,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  orderTotal: { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  orderMeta:  { fontSize: 12, color: colors.textSecondary },
});
