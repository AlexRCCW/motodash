import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert
} from 'react-native';
import { supabase } from '../../config/supabase';
import { t } from '../../i18n';

export default function ClientInventoryScreen({ navigation, route }) {
  const { store, clientLocation } = route.params;
  const [items, setItems]         = useState([]);
  const [order, setOrder]         = useState({}); // { itemId: qty }
  const [loading, setLoading]     = useState(true);

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const { data, error } = await supabase
      .from('store_items')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_available', true)
      .order('name');

    if (!error) setItems(data || []);
    setLoading(false);
  }

  function changeQty(itemId, delta) {
    setOrder(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  }

  function getOrderTotal() {
    return Object.entries(order).reduce((sum, [id, qty]) => {
      const item = items.find(i => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }

  function getOrderItemCount() {
    return Object.values(order).reduce((s, q) => s + q, 0);
  }

  function handleNext() {
    if (getOrderItemCount() === 0) {
      Alert.alert(t('clientInventory.noItemsAlert'), t('clientInventory.noItemsMsg'));
      return;
    }
    const orderItems = Object.entries(order).map(([id, qty]) => {
      const item = items.find(i => i.id === id);
      return { item_id: id, name: item.name, qty, price: item.price };
    });
    navigation.navigate('ClientOrder', {
      store,
      clientLocation,
      orderItems,
    });
  }

  function renderItem({ item }) {
    const qty = order[item.id] || 0;
    const outOfStock = item.inventory_count === 0;

    return (
      <View style={[styles.itemRow, outOfStock && styles.itemRowDimmed]}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemPrice}>${Number(item.price).toFixed(2)}</Text>
          {outOfStock && (
            <Text style={styles.outOfStock}>{t('clientInventory.outOfStock')}</Text>
          )}
        </View>
        <View style={styles.qtyControls}>
          <TouchableOpacity
            style={[styles.qtyBtn, qty === 0 && styles.qtyBtnDisabled]}
            onPress={() => changeQty(item.id, -1)}
            disabled={qty === 0}
          >
            <Text style={styles.qtyBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.qtyValue}>{qty}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => changeQty(item.id, 1)}
          >
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>{t('shared.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{store.store_name}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('clientInventory.noItems')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Bottom bar */}
      <View style={styles.footer}>
        {getOrderItemCount() > 0 && (
          <Text style={styles.orderSummary}>
            {getOrderItemCount() !== 1
              ? t('clientInventory.itemCountPlural', { count: getOrderItemCount() })
              : t('clientInventory.itemCount', { count: getOrderItemCount() })
            } · ${getOrderTotal().toFixed(2)} {t('clientInventory.estimated')}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, getOrderItemCount() === 0 && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={getOrderItemCount() === 0}
        >
          <Text style={styles.nextBtnText}>{t('clientInventory.reviewOrder')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' },
  back:           { color: '#2563eb', fontSize: 16, width: 60 },
  headerTitle:    { fontSize: 17, fontWeight: '700', color: '#1a1a1a', flex: 1, textAlign: 'center' },
  list:           { padding: 16 },
  itemRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  itemRowDimmed:  { opacity: 0.6 },
  itemInfo:       { flex: 1 },
  itemName:       { fontSize: 16, fontWeight: '600', color: '#1a1a1a' },
  itemPrice:      { fontSize: 14, color: '#2563eb', marginTop: 3, fontWeight: '600' },
  outOfStock:     { fontSize: 12, color: '#d97706', marginTop: 3 },
  qtyControls:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn:         { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' },
  qtyBtnDisabled: { backgroundColor: '#e5e7eb' },
  qtyBtnText:     { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  qtyValue:       { fontSize: 16, fontWeight: '700', color: '#1a1a1a', minWidth: 24, textAlign: 'center' },
  emptyText:      { fontSize: 16, color: '#6b7280' },
  footer:         { padding: 16, paddingBottom: 32, borderTopWidth: 1, borderColor: '#eee' },
  orderSummary:   { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  nextBtn:        { backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center' },
  nextBtnDisabled:{ backgroundColor: '#93c5fd' },
  nextBtnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
});
