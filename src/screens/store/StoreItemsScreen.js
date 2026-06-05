import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getStoreItems, upsertStoreItem, deleteStoreItem } from '../../services/jobService';
import { t } from '../../i18n';

const EMPTY_FORM = { name: '', price: '', stockCount: '' };

// ── Screen ────────────────────────────────────────────────────

export default function StoreItemsScreen({ navigation }) {
  const { account } = useAuth();
  const [items,        setItems]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem,  setEditingItem]  = useState(null);   // null = new item
  const [form,         setForm]         = useState(EMPTY_FORM);

  // ── Data loading ────────────────────────────────────────────

  const loadItems = useCallback(async () => {
    if (!account?.id) return;
    const { data, error } = await getStoreItems(account.id);
    if (error) {
      Alert.alert(t('shared.error'), error.message ?? t('storeItems.loadError'));
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, [account?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadItems();
    }, [loadItems])
  );

  // ── Modal helpers ───────────────────────────────────────────

  function openAdd() {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setForm({
      name:       item.name,
      price:      String(item.price),
      stockCount: String(item.inventory_count),
    });
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    setEditingItem(null);
    setForm(EMPTY_FORM);
  }

  // ── Save / Delete ───────────────────────────────────────────

  async function handleSave() {
    const name       = form.name.trim();
    const priceNum   = parseFloat(form.price);
    const stockNum   = parseInt(form.stockCount, 10);

    if (!name || isNaN(priceNum) || isNaN(stockNum)) {
      Alert.alert(t('shared.error'), t('auth.pleaseFillAll'));
      return;
    }

    setSaving(true);
    const { error } = await upsertStoreItem({
      id:         editingItem?.id ?? null,
      storeId:    account.id,
      name,
      price:      priceNum,
      stockCount: stockNum,
    });

    if (error) {
      Alert.alert(t('shared.error'), error.message ?? t('storeItems.saveError'));
    } else {
      closeModal();
      await loadItems();
    }
    setSaving(false);
  }

  function handleDelete() {
    Alert.alert(
      t('storeItems.confirmDelete'),
      t('storeItems.confirmDeleteMsg'),
      [
        { text: t('storeItems.cancel'), style: 'cancel' },
        {
          text:  t('storeItems.delete'),
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const { error } = await deleteStoreItem(editingItem.id);
            if (error) {
              Alert.alert(t('shared.error'), error.message ?? t('storeItems.deleteError'));
            } else {
              closeModal();
              await loadItems();
            }
            setSaving(false);
          },
        },
      ]
    );
  }

  // ── List item ───────────────────────────────────────────────

  function renderItem({ item }) {
    const outOfStock = item.inventory_count === 0;
    return (
      <TouchableOpacity
        style={styles.itemCard}
        onPress={() => openEdit(item)}
        activeOpacity={0.75}
      >
        <View style={styles.itemCardMain}>
          <View style={styles.itemCardLeft}>
            <Text style={styles.itemCardName}>{item.name}</Text>
            <Text style={styles.itemCardStock}>
              {t('storeItems.stock', { count: item.inventory_count })}
            </Text>
          </View>
          <View style={styles.itemCardRight}>
            <Text style={styles.itemCardPrice}>${Number(item.price).toFixed(2)}</Text>
            {outOfStock && (
              <View style={styles.outOfStockBadge}>
                <Text style={styles.outOfStockText}>{t('storeItems.outOfStock')}</Text>
              </View>
            )}
          </View>
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>{t('shared.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('storeItems.title')}</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>{t('storeItems.addItem')}</Text>
        </TouchableOpacity>
      </View>

      {/* Items list */}
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{t('storeItems.noItems')}</Text>
            <Text style={styles.emptySubtitle}>{t('storeItems.noItemsSubtext')}</Text>
          </View>
        }
      />

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingItem ? t('storeItems.editItem') : t('storeItems.newItem')}
            </Text>

            {/* Fields */}
            <Text style={styles.fieldLabel}>{t('storeItems.itemName')}</Text>
            <TextInput
              style={styles.input}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder={t('storeItems.itemName')}
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>{t('storeItems.price')}</Text>
            <TextInput
              style={styles.input}
              value={form.price}
              onChangeText={v => setForm(f => ({ ...f, price: v }))}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>{t('storeItems.inventory')}</Text>
            <TextInput
              style={styles.input}
              value={form.stockCount}
              onChangeText={v => setForm(f => ({ ...f, stockCount: v }))}
              placeholder="0"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
              returnKeyType="done"
            />

            {/* Buttons */}
            <View style={styles.modalBtns}>
              {editingItem && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={handleDelete}
                  disabled={saving}
                >
                  <Text style={styles.deleteBtnText}>{t('storeItems.delete')}</Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalBtnsRight}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={closeModal}
                  disabled={saving}
                >
                  <Text style={styles.cancelBtnText}>{t('storeItems.cancel')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>{t('storeItems.save')}</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
  backBtn:     { paddingRight: 4 },
  backText:    { fontSize: 14, color: '#16a34a', fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  addBtn: {
    backgroundColor:   '#16a34a',
    paddingHorizontal: 12,
    paddingVertical:    7,
    borderRadius:       8,
  },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  // List
  listContent: { padding: 16, paddingBottom: 40 },

  // Item card
  itemCard: {
    backgroundColor: '#f9fafb',
    borderRadius:    12,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  itemCardMain: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  itemCardLeft:  { flex: 1, marginRight: 8 },
  itemCardName:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  itemCardStock: { fontSize: 13, color: '#6b7280' },
  itemCardRight: { alignItems: 'flex-end', gap: 6 },
  itemCardPrice: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },

  // Out of stock badge
  outOfStockBadge: {
    backgroundColor:   '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      6,
  },
  outOfStockText: { fontSize: 11, fontWeight: '600', color: '#dc2626' },

  // Empty state
  emptyState: {
    flex:       1,
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: '#9ca3af', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },

  // Modal overlay
  modalOverlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor:   '#fff',
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:           24,
    paddingBottom:     36,
  },
  modalTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        '#1a1a1a',
    marginBottom: 20,
  },

  // Form fields
  fieldLabel: {
    fontSize:     12,
    fontWeight:   '600',
    color:        '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  6,
  },
  input: {
    borderWidth:       1,
    borderColor:       '#d1d5db',
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   11,
    fontSize:          15,
    color:             '#1a1a1a',
    backgroundColor:   '#f9fafb',
    marginBottom:      14,
  },

  // Modal buttons
  modalBtns: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginTop:       8,
  },
  modalBtnsRight: { flexDirection: 'row', gap: 10 },

  deleteBtn: {
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      10,
    backgroundColor:   '#fee2e2',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },

  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical:   11,
    borderRadius:      10,
    backgroundColor:   '#f3f4f6',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  saveBtn: {
    backgroundColor:   '#16a34a',
    paddingHorizontal: 20,
    paddingVertical:   11,
    borderRadius:      10,
    minWidth:          80,
    alignItems:        'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { fontSize: 14, fontWeight: '700', color: '#fff' },
});
