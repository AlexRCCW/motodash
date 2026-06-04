import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Alert,
  ActivityIndicator, Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { markDeliveryCompleteClient } from '../../services/jobService';

// Order statuses: pending | accepted | out_for_delivery | delivered | canceled | returned
const STATUS_LABELS = {
  pending:          { label: 'Pending store confirmation', color: '#d97706', bg: '#fef3c7' },
  accepted:         { label: 'Store is preparing order',   color: '#2563eb', bg: '#eff6ff' },
  out_for_delivery: { label: 'Out for delivery 🏍️',        color: '#7c3aed', bg: '#f5f3ff' },
  delivered:        { label: 'Delivered',                  color: '#16a34a', bg: '#dcfce7' },
  canceled:         { label: 'Canceled',                   color: '#dc2626', bg: '#fee2e2' },
  returned:         { label: 'Returned',                   color: '#6b7280', bg: '#f3f4f6' },
};

export default function ClientOrderScreen({ navigation, route }) {
  const { account } = useAuth();
  const { store, clientLocation, orderItems, job: resumedJob } = route.params || {};

  // Pre-order state
  const [notes, setNotes]         = useState('');
  const [placing, setPlacing]     = useState(false);

  // Post-order state
  const [job, setJob]             = useState(resumedJob || null);
  const [showAd, setShowAd]       = useState(false);
  const [completing, setCompleting] = useState(false);
  const [adShownWaiting, setAdShownWaiting] = useState(false);

  const isPlaced = !!job;

  useEffect(() => {
    if (!job?.id) return;

    // Subscribe to delivery job updates
    const channel = supabase
      .channel(`delivery_job_${job.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'delivery_jobs',
        filter: `id=eq.${job.id}`,
      }, payload => {
        setJob(payload.new);
        // Show waiting ad when order goes out for delivery
        if (payload.new.status === 'out_for_delivery' && !adShownWaiting) {
          setAdShownWaiting(true);
          setShowAd(true);
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [job?.id]);

  async function handlePlaceOrder() {
    if (!store || !clientLocation || !orderItems?.length) return;
    setPlacing(true);

    const { data, error } = await supabase
      .from('delivery_jobs')
      .insert({
        client_id:    account.id,
        client_lat:   clientLocation.lat,
        client_lng:   clientLocation.lng,
        store_id:     store.id,
        store_lat:    store.location_lat,
        store_lng:    store.location_lng,
        items:        orderItems,
        order_notes:  notes,
        status:       'pending',
      })
      .select()
      .single();

    setPlacing(false);

    if (error || !data) {
      Alert.alert('Error', 'Could not place your order. Please try again.');
      return;
    }

    setJob(data);
    await AsyncStorage.setItem('open_job', 'true');
    await AsyncStorage.setItem('open_job_type', 'delivery');
    await AsyncStorage.setItem('open_job_id', data.id);
  }

  function handleMarkReceived() {
    setShowAd(true);
  }

  async function handleAdComplete() {
    setShowAd(false);

    // Waiting ad — just dismiss
    if (job?.status === 'out_for_delivery' && !completing) return;

    setCompleting(true);
    const { error } = await markDeliveryCompleteClient(job.id);
    if (error) {
      Alert.alert('Error', 'Could not complete the order. Please try again.',
        [{ text: 'Retry', onPress: () => handleAdComplete() }]
      );
      setCompleting(false);
      return;
    }
    await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
    navigation.replace('ClientHome');
  }

  const currentStatus = STATUS_LABELS[job?.status] || STATUS_LABELS.pending;

  return (
    <View style={styles.container}>

      {/* Ad modal */}
      <Modal visible={showAd} animationType="slide" transparent={false}>
        <View style={styles.adContainer}>
          <Text style={styles.adTitle}>MotoDash Partner Ad</Text>
          <Text style={styles.adSubtitle}>Video interstitial shown here</Text>
          <TouchableOpacity style={styles.adButton} onPress={handleAdComplete}>
            <Text style={styles.adButtonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => !isPlaced && navigation.goBack()}>
          <Text style={[styles.back, isPlaced && { opacity: 0 }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isPlaced ? 'Order status' : 'Review order'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Store name */}
        <View style={styles.storeRow}>
          <Text style={styles.storeLabel}>Store</Text>
          <Text style={styles.storeName}>{store?.store_name || job?.store_id}</Text>
        </View>

        {/* Status badge (post-order) */}
        {isPlaced && (
          <View style={[styles.statusBadge, { backgroundColor: currentStatus.bg }]}>
            <Text style={[styles.statusText, { color: currentStatus.color }]}>
              {currentStatus.label}
            </Text>
          </View>
        )}

        {/* Map showing store (post-order) */}
        {isPlaced && job?.store_lat && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              region={{
                latitude: job.store_lat,
                longitude: job.store_lng,
                latitudeDelta: 0.02,
                longitudeDelta: 0.02,
              }}
            >
              <Marker
                coordinate={{ latitude: job.store_lat, longitude: job.store_lng }}
                title={store?.store_name || 'Store'}
                pinColor="#f59e0b"
              />
              {job.client_lat && (
                <Marker
                  coordinate={{ latitude: job.client_lat, longitude: job.client_lng }}
                  title="You"
                  pinColor="#2563eb"
                />
              )}
            </MapView>
          </View>
        )}

        {/* Order items */}
        <Text style={styles.sectionTitle}>Order items</Text>
        {(orderItems || job?.items || []).map((item, i) => (
          <View key={i} style={styles.itemRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemQty}>×{item.qty}</Text>
            <Text style={styles.itemPrice}>
              ${(item.price * item.qty).toFixed(2)}
            </Text>
          </View>
        ))}

        {/* Notes (pre-order) */}
        {!isPlaced && (
          <>
            <Text style={styles.sectionTitle}>Delivery notes</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Add delivery instructions, gate codes, landmarks..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              value={notes}
              onChangeText={setNotes}
            />
            <Text style={styles.phoneNote}>
              📞 The store will call {account?.phone} to confirm your order before starting.
            </Text>
          </>
        )}

        {/* Notes (post-order) */}
        {isPlaced && job?.order_notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Delivery notes</Text>
            <Text style={styles.notesText}>{job.order_notes}</Text>
          </View>
        ) : null}

        {/* Order total (post-order) */}
        {isPlaced && job?.order_total && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Order total</Text>
            <Text style={styles.totalValue}>${Number(job.order_total).toFixed(2)}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer action */}
      <View style={styles.footer}>
        {!isPlaced && (
          <TouchableOpacity
            style={[styles.primaryBtn, placing && styles.primaryBtnDisabled]}
            onPress={handlePlaceOrder}
            disabled={placing}
          >
            {placing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Place order</Text>
            }
          </TouchableOpacity>
        )}

        {isPlaced && job?.status === 'out_for_delivery' && (
          <TouchableOpacity
            style={[styles.primaryBtn, completing && styles.primaryBtnDisabled]}
            onPress={handleMarkReceived}
            disabled={completing}
          >
            <Text style={styles.primaryBtnText}>Mark order received</Text>
          </TouchableOpacity>
        )}

        {isPlaced && !['out_for_delivery', 'delivered'].includes(job?.status) && (
          <View style={styles.waitingPanel}>
            <Text style={styles.waitingText}>
              {job?.status === 'pending'
                ? 'Waiting for store to confirm your order...'
                : 'Order confirmed — preparing your items'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' },
  back:               { color: '#2563eb', fontSize: 16, width: 60 },
  headerTitle:        { fontSize: 18, fontWeight: '700', color: '#1a1a1a' },
  content:            { padding: 16, paddingBottom: 24 },
  storeRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  storeLabel:         { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  storeName:          { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  statusBadge:        { borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'center' },
  statusText:         { fontWeight: '700', fontSize: 15 },
  mapContainer:       { height: 160, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  map:                { flex: 1 },
  sectionTitle:       { fontSize: 14, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', marginBottom: 10, marginTop: 8 },
  itemRow:            { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f3f4f6' },
  itemName:           { flex: 1, fontSize: 15, color: '#1a1a1a' },
  itemQty:            { fontSize: 14, color: '#6b7280', marginRight: 12 },
  itemPrice:          { fontSize: 15, fontWeight: '600', color: '#2563eb' },
  notesInput:         { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, color: '#1a1a1a', textAlignVertical: 'top', minHeight: 80, marginBottom: 12 },
  phoneNote:          { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 8 },
  notesBox:           { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginTop: 8 },
  notesLabel:         { fontSize: 12, color: '#6b7280', fontWeight: '600', textTransform: 'uppercase' },
  notesText:          { fontSize: 14, color: '#374151', marginTop: 4 },
  totalRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 2, borderColor: '#e5e7eb' },
  totalLabel:         { fontSize: 16, fontWeight: '700', color: '#1a1a1a' },
  totalValue:         { fontSize: 20, fontWeight: '700', color: '#2563eb' },
  footer:             { padding: 16, paddingBottom: 32, borderTopWidth: 1, borderColor: '#eee' },
  primaryBtn:         { backgroundColor: '#2563eb', borderRadius: 12, padding: 18, alignItems: 'center' },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  waitingPanel:       { backgroundColor: '#f3f4f6', borderRadius: 12, padding: 16, alignItems: 'center' },
  waitingText:        { color: '#6b7280', fontSize: 15, textAlign: 'center' },
  adContainer:        { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 32 },
  adTitle:            { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  adSubtitle:         { fontSize: 16, color: '#9ca3af', marginBottom: 40 },
  adButton:           { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', width: '100%' },
  adButtonText:       { color: '#fff', fontWeight: '700', fontSize: 15 },
});
