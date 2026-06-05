import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../context/AuthContext';
import {
  getStoreItems, upsertStoreItem, deleteStoreItem, uploadProductImage,
} from '../../services/jobService';
import { t } from '../../i18n';

const EMPTY_FORM = { name: '', price: '', stockCount: '' };

// ── Thumbnail with error fallback ─────────────────────────────
// React Native's Image shows its backgroundColor (grey) when a URI fails.
// This wrapper falls back to the 📦 placeholder instead.

function ItemThumbnail({ uri }) {
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={styles.thumbnailPlaceholder}>
        <Text style={styles.thumbnailIcon}>📦</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.thumbnail}
      onError={() => setFailed(true)}
    />
  );
}

// ── Screen ────────────────────────────────────────────────────

export default function StoreItemsScreen({ navigation }) {
  const { account } = useAuth();
  const [items,         setItems]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [modalVisible,  setModalVisible]  = useState(false);
  const [editingItem,   setEditingItem]   = useState(null);
  const [form,          setForm]          = useState(EMPTY_FORM);
  const [localImageUri,    setLocalImageUri]    = useState(null); // preview URI
  const [localImageBase64, setLocalImageBase64] = useState(null); // base64 for upload

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
    setLocalImageUri(null);
    setLocalImageBase64(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditingItem(item);
    setLocalImageUri(null);
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
    setLocalImageUri(null);
    setLocalImageBase64(null);
    setForm(EMPTY_FORM);
  }

  // ── Image picker ────────────────────────────────────────────

  function handlePickImage() {
    Alert.alert(
      t('storeItems.photoOptions'),
      '',
      [
        { text: t('storeItems.takePhoto'),   onPress: () => pickImage('camera')  },
        { text: t('storeItems.choosePhoto'), onPress: () => pickImage('library') },
        { text: t('shared.cancel'), style: 'cancel' },
      ]
    );
  }

  async function pickImage(source) {
    let result;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('shared.error'), 'Camera permission denied.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       1,        // pick at full quality; we resize below
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('shared.error'), 'Photo library permission denied.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    ImagePicker.MediaTypeOptions.Images, // MediaType not in runtime until SDK 56
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       1,
      });
    }

    if (!result.canceled && result.assets?.length > 0) {
      // Resize to max 300×300 and compress — keeps uploads well under 80 KB
      // The 1:1 crop above guarantees the output is also square (300×300)
      // base64: true gives us the encoded data directly — no expo-file-system needed
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 300 } }],
        { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setLocalImageUri(resized.uri);       // for the preview
      setLocalImageBase64(resized.base64); // for the upload
    }
  }

  // ── Save ────────────────────────────────────────────────────

  async function handleSave() {
    const name     = form.name.trim();
    const priceNum = parseFloat(form.price);
    const stockNum = parseInt(form.stockCount, 10);

    if (!name || isNaN(priceNum) || isNaN(stockNum)) {
      Alert.alert(t('shared.error'), t('auth.pleaseFillAll'));
      return;
    }

    setSaving(true);
    try {
      // ── Step 1: save item fields ─────────────────────────
      const { data: savedItem, error: saveError } = await upsertStoreItem({
        id:         editingItem?.id ?? null,
        storeId:    account.id,
        name,
        price:      priceNum,
        stockCount: stockNum,
        // Keep existing image URL if no new image was picked
        imageUrl:   localImageUri ? undefined : (editingItem?.image_url ?? undefined),
      });

      if (saveError) {
        Alert.alert(t('shared.error'), saveError.message ?? t('storeItems.saveError'));
        return;
      }

      // ── Step 2: upload new image if picked ───────────────
      if (localImageBase64 && savedItem?.id) {
        const { url, error: imgError } = await uploadProductImage(
          account.id,
          savedItem.id,
          localImageBase64
        );

        if (imgError) {
          // Item is saved — warn but don't block
          Alert.alert(t('shared.error'), imgError.message ?? t('storeItems.uploadError'));
        } else if (url) {
          const { error: urlSaveError } = await upsertStoreItem({
            id:         savedItem.id,
            storeId:    account.id,
            name,
            price:      priceNum,
            stockCount: stockNum,
            imageUrl:   url,
          });
          if (urlSaveError) {
            Alert.alert(t('shared.error'), urlSaveError.message ?? t('storeItems.saveError'));
          }
        }
      }

      closeModal();
      await loadItems();
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────

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
          {/* Thumbnail — falls back to 📦 if the URL fails to load */}
          <ItemThumbnail uri={item.image_url} />

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

  // ── Loading ─────────────────────────────────────────────────

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

  const previewUri = localImageUri ?? editingItem?.image_url ?? null;

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

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* ── Image picker ── */}
              <TouchableOpacity
                style={styles.imagePicker}
                onPress={handlePickImage}
                activeOpacity={0.8}
              >
                {previewUri ? (
                  <>
                    <Image
                      source={{ uri: previewUri }}
                      style={styles.imagePreview}
                      resizeMode="cover"
                    />
                    <View style={styles.imageOverlay}>
                      <Text style={styles.imageOverlayText}>
                        {t('storeItems.changePhoto')}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imagePlaceholderIcon}>📷</Text>
                    <Text style={styles.imagePlaceholderLabel}>
                      {t('storeItems.addPhoto')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* ── Fields ── */}
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
            </ScrollView>

            {/* ── Buttons ── */}
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
    padding:         12,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#e5e7eb',
  },
  itemCardMain: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
  },

  // Thumbnail in list
  thumbnail: {
    width:        56,
    height:       56,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  thumbnailPlaceholder: {
    width:           56,
    height:          56,
    borderRadius:     8,
    backgroundColor: '#f3f4f6',
    justifyContent:  'center',
    alignItems:      'center',
  },
  thumbnailIcon: { fontSize: 24 },

  itemCardLeft:  { flex: 1 },
  itemCardName:  { fontSize: 15, fontWeight: '600', color: '#1a1a1a', marginBottom: 4 },
  itemCardStock: { fontSize: 13, color: '#6b7280' },
  itemCardRight: { alignItems: 'flex-end', gap: 6 },
  itemCardPrice: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },

  outOfStockBadge: {
    backgroundColor:   '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical:   3,
    borderRadius:      6,
  },
  outOfStockText: { fontSize: 11, fontWeight: '600', color: '#dc2626' },

  // Empty state
  emptyState:    { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyTitle:    { fontSize: 16, fontWeight: '600', color: '#9ca3af', marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: '#d1d5db', textAlign: 'center' },

  // Modal
  modalOverlay: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor:      '#fff',
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    padding:              24,
    paddingBottom:        36,
    maxHeight:            '90%',
  },
  modalTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        '#1a1a1a',
    marginBottom: 16,
  },

  // Image picker in modal
  imagePicker: {
    height:           180,
    borderRadius:     12,
    marginBottom:     16,
    overflow:         'hidden',
    backgroundColor:  '#f3f4f6',
    borderWidth:      1,
    borderColor:      '#e5e7eb',
    borderStyle:      'dashed',
  },
  imagePreview: {
    width:  '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent:  'flex-end',
    alignItems:      'center',
    paddingBottom:   12,
  },
  imageOverlayText: {
    color:      '#fff',
    fontSize:   14,
    fontWeight: '600',
  },
  imagePlaceholder: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            8,
  },
  imagePlaceholderIcon:  { fontSize: 36 },
  imagePlaceholderLabel: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  // Form
  fieldLabel: {
    fontSize:      12,
    fontWeight:    '600',
    color:         '#6b7280',
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
  modalBtns:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  modalBtnsRight: { flexDirection: 'row', gap: 10 },

  deleteBtn:     { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#fee2e2' },
  deleteBtnText: { fontSize: 14, fontWeight: '600', color: '#dc2626' },

  cancelBtn:     { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#f3f4f6' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  saveBtn:        { backgroundColor: '#16a34a', paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10, minWidth: 80, alignItems: 'center' },
  saveBtnDisabled:{ opacity: 0.6 },
  saveBtnText:    { fontSize: 14, fontWeight: '700', color: '#fff' },
});
