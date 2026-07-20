import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, Alert, Image,
  TextInput, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../config/supabase';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

const MAX_OTHER_ITEMS = 10;

export default function ClientInventoryScreen({ navigation, route }) {
  const { store, clientLocation } = route.params;
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [items,        setItems]        = useState([]);
  const [order,        setOrder]        = useState({});          // { itemId: qty }
  const [otherItems,   setOtherItems]   = useState([]);          // [{ id, name }]
  const [loading,      setLoading]      = useState(true);
  const [otherInput,   setOtherInput]   = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

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

  // ── Regular item qty ─────────────────────────────────────────

  function changeQty(itemId, delta) {
    setOrder(prev => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  }

  // ── Other items ──────────────────────────────────────────────

  function addOtherItem() {
    if (otherItems.length >= MAX_OTHER_ITEMS) {
      Alert.alert(t('shared.error'), t('clientInventory.maxOtherItems'));
      return;
    }
    setOtherInput('');
    setShowOtherInput(true);
  }

  function confirmOtherItem() {
    const name = otherInput.trim();
    if (name) {
      setOtherItems(prev => [
        ...prev,
        { id: `other_${Date.now()}_${Math.random()}`, name },
      ]);
    }
    setOtherInput('');
    setShowOtherInput(false);
    Keyboard.dismiss();
  }

  function cancelOtherItem() {
    setOtherInput('');
    setShowOtherInput(false);
    Keyboard.dismiss();
  }

  function removeOtherItem(id) {
    setOtherItems(prev => prev.filter(oi => oi.id !== id));
  }

  // ── Totals ───────────────────────────────────────────────────

  function getOrderItemCount() {
    return Object.values(order).reduce((s, q) => s + q, 0) + otherItems.length;
  }

  function getOrderTotal() {
    return Object.entries(order).reduce((sum, [id, qty]) => {
      const item = items.find(i => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0);
  }

  // ── Navigate to review ───────────────────────────────────────

  function handleNext() {
    if (getOrderItemCount() === 0) {
      Alert.alert(t('clientInventory.noItemsAlert'), t('clientInventory.noItemsMsg'));
      return;
    }

    const regularItems = Object.entries(order).map(([id, qty]) => {
      const item = items.find(i => i.id === id);
      return { item_id: id, name: item.name, qty, price: item.price };
    });

    const customItems = otherItems.map(oi => ({
      item_id:  null,
      name:     oi.name,
      qty:      1,
      price:    0,
      isOther:  true,
    }));

    navigation.navigate('ClientOrder', {
      store,
      clientLocation,
      orderItems: [...regularItems, ...customItems],
    });
  }

  // ── Render ───────────────────────────────────────────────────

  function renderItem({ item }) {
    const qty        = order[item.id] || 0;
    const outOfStock = item.inventory_count === 0;

    return (
      <View style={[styles.itemRow, outOfStock && styles.itemRowDimmed]}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.itemThumb} />
        ) : (
          <View style={styles.itemThumbPlaceholder} />
        )}
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemPrice}>${Number(item.price).toFixed(2)}</Text>
          {outOfStock && (
            <Text style={styles.outOfStock}>{t('clientInventory.outOfStock').toUpperCase()}</Text>
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

  const listFooter = (
    <View>
      {/* ── Other items section ── */}
      {otherItems.length > 0 && (
        <>
          <Text style={styles.otherSectionTitle}>{t('clientInventory.otherItems').toUpperCase()}</Text>
          {otherItems.map(oi => (
            <View key={oi.id} style={styles.otherItemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{oi.name}</Text>
                <Text style={styles.otherItemTBD}>{t('clientInventory.otherItemTBD').toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeOtherItem(oi.id)}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      {/* ── Add other item ── */}
      {showOtherInput ? (
        <View style={styles.otherInputRow}>
          <TextInput
            style={styles.otherInputField}
            value={otherInput}
            onChangeText={setOtherInput}
            placeholder={t('clientInventory.addOtherItem')}
            placeholderTextColor={colors.textSecondary}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={confirmOtherItem}
          />
          <TouchableOpacity style={styles.otherInputConfirm} onPress={confirmOtherItem}>
            <Text style={styles.otherInputConfirmText}>{t('shared.ok').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.otherInputCancel} onPress={cancelOtherItem}>
            <Text style={styles.otherInputCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.addOtherBtn,
            otherItems.length >= MAX_OTHER_ITEMS && styles.addOtherBtnDisabled,
          ]}
          onPress={addOtherItem}
          disabled={otherItems.length >= MAX_OTHER_ITEMS}
        >
          <Text style={styles.addOtherBtnText}>{t('clientInventory.addOtherItem').toUpperCase()}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.heroBackBtn}>
            <Text style={styles.heroBackText}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle} numberOfLines={1}>{store.store_name.toUpperCase()}</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('clientInventory.noItems').toUpperCase()}</Text>
            </View>
          }
          ListFooterComponent={listFooter}
        />
      )}

      {/* Footer */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        {getOrderItemCount() > 0 && (
          <Text style={styles.orderSummary}>
            {getOrderItemCount() !== 1
              ? t('clientInventory.itemCountPlural', { count: getOrderItemCount() })
              : t('clientInventory.itemCount',       { count: getOrderItemCount() })
            }
            {getOrderTotal() > 0 && ` · $${getOrderTotal().toFixed(2)} ${t('clientInventory.estimated')}`}
            {otherItems.length > 0 && ` + ${otherItems.length} TBD`}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, getOrderItemCount() === 0 && styles.nextBtnDisabled]}
          onPress={handleNext}
          disabled={getOrderItemCount() === 0}
        >
          <Text style={styles.nextBtnText}>{t('clientInventory.reviewOrder').toUpperCase()}</Text>
        </TouchableOpacity>
      </SafeAreaView>

    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root:     { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },

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
  heroTitle: {
    fontSize:  14,
    fontWeight:'500',
    color:     colors.onDark,
    letterSpacing: 1.5,
    flex:      1,
    textAlign: 'center',
  },
  heroBackBtn:  { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: '#ffffff', letterSpacing: 1.5 },

  list:          { padding: 16, paddingBottom: 8 },
  itemRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border, gap: 12 },
  itemRowDimmed: { opacity: 0.5 },
  itemThumb: {
    width:        52,
    height:       52,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  itemThumbPlaceholder: {
    width:        52,
    height:       52,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  itemInfo:      { flex: 1 },
  itemName:      { fontSize: 15, fontWeight: '500', color: colors.textPrimary },
  itemPrice:     { fontSize: 14, color: colors.primary, marginTop: 3, fontWeight: '500' },
  outOfStock: {
    fontSize:      10,
    color:         colors.textSecondary,
    marginTop:     3,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
    fontWeight:    '500',
  },

  qtyControls:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width:           32,
    height:          32,
    borderRadius:    radius.sm,
    backgroundColor: colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  qtyBtnDisabled: { backgroundColor: colors.border },
  qtyBtnText:     { color: colors.onDark, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  qtyValue:       { fontSize: 16, fontWeight: '500', color: colors.textPrimary, minWidth: 24, textAlign: 'center' },

  // Other items section
  otherSectionTitle: {
    fontSize:      11,
    fontWeight:    '500',
    color:         colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing:  1.5,
    marginTop:     20,
    marginBottom:   8,
  },
  otherItemRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor:     colors.border,
  },
  otherItemTBD: {
    fontSize:      10,
    color:         colors.primary,
    fontWeight:    '500',
    marginTop:     3,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  removeBtn: {
    width:           32,
    height:          32,
    borderRadius:    radius.sm,
    backgroundColor: colors.surface,
    borderWidth:     1,
    borderColor:     colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  removeBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },

  // Add other item button
  addOtherBtn: {
    marginTop:    16,
    marginBottom:  8,
    borderWidth:   1,
    borderColor:  colors.primary,
    borderStyle:  'dashed',
    borderRadius: radius.md,
    padding:      14,
    alignItems:   'center',
  },
  addOtherBtnDisabled: { borderColor: colors.border, opacity: 0.5 },

  otherInputRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginTop:      16,
    marginBottom:   8,
    gap:            8,
  },
  otherInputField: {
    flex:            1,
    height:          44,
    borderWidth:     1,
    borderColor:     colors.primary,
    borderRadius:    radius.md,
    paddingHorizontal: 12,
    fontSize:        14,
    color:           colors.textPrimary,
    backgroundColor: colors.surface,
  },
  otherInputConfirm: {
    height:          44,
    paddingHorizontal: 14,
    borderRadius:    radius.md,
    backgroundColor: colors.primary,
    justifyContent:  'center',
    alignItems:      'center',
  },
  otherInputConfirmText: {
    color:      colors.onDark,
    fontSize:   11,
    fontWeight: '500',
    letterSpacing: 1,
  },
  otherInputCancel: {
    width:           36,
    height:          44,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    justifyContent:  'center',
    alignItems:      'center',
  },
  otherInputCancelText: { color: colors.textSecondary, fontSize: 14 },

  addOtherBtnText: {
    color:         colors.primary,
    fontSize:      11,
    fontWeight:    '500',
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  emptyText: {
    fontSize:      13,
    color:         colors.textSecondary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },

  footer: {
    padding:         16,
    paddingBottom:   12,
    borderTopWidth:  1,
    borderColor:     colors.border,
    backgroundColor: colors.background,
  },
  orderSummary: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 10 },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
});
