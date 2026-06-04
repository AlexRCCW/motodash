import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet
} from 'react-native';

const SECTIONS = [
  {
    key: 'client',
    label: 'For clients',
    content: [
      'Download the app and create a Client account.',
      'From the home screen, choose "Request a ride" or "Place an order".',
      'For rides: tap the request button and wait for a driver to accept. You will see the driver on the map once accepted.',
      'For orders: browse stores near you, add items to your order, and place it. The store will call you to confirm before starting.',
      'Once your ride or delivery is complete, tap "Mark complete" to finish the job.',
      'Never share personal information with drivers or stores outside the app.',
      'If you feel unsafe, cancel the job and contact local authorities.',
    ],
  },
  {
    key: 'driver',
    label: 'For drivers',
    content: [
      'Create a Driver account with your motorcycle details and cedula number.',
      'From the home screen, tap "Mark ready" to start receiving job offers.',
      'You will have 15 seconds to accept each offer. Refusing 3 jobs in a row will mark you as unavailable.',
      'For rides: navigate to the client location. The "Mark complete" button appears when you are within 20 feet.',
      'For deliveries: go to the store first, pick up the order, then deliver to the client. Return to the store with payment.',
      'Always take a photo of deliveries as proof — store it on your device for your own protection.',
      'Do not steal orders or refuse jobs without good reason. Abuse will result in account suspension.',
    ],
  },
  {
    key: 'store',
    label: 'For stores',
    content: [
      'Create a Store account — your location will be set from your phone\'s GPS.',
      'Add your inventory items with prices and stock counts. Keep inventory updated.',
      'When a new order arrives you will receive a notification. Review and accept orders promptly.',
      'Call the client to confirm the order before preparing it.',
      'Once the order is ready, enter the total and mark it ready for delivery. Assign a driver from your preferred list or post to the general pool.',
      'Mark the delivery as paid once the driver returns with payment to close the job.',
      'Do not accept orders you cannot fulfill. Cancel promptly if needed.',
    ],
  },
];

export default function InstructionsScreen({ navigation }) {
  const [active, setActive] = useState('client');
  const section = SECTIONS.find(s => s.key === active);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>How it works</Text>

      <View style={styles.tabs}>
        {SECTIONS.map(s => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, active === s.key && styles.tabActive]}
            onPress={() => setActive(s.key)}
          >
            <Text style={[styles.tabText, active === s.key && styles.tabTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {section.content.map((item, i) => (
          <View key={i} style={styles.item}>
            <Text style={styles.bullet}>{i + 1}</Text>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </ScrollView>

      {navigation && (
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#fff', paddingTop: 56 },
  title:           { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 20, color: '#1a1a1a' },
  tabs:            { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', marginBottom: 16 },
  tab:             { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:       { borderBottomWidth: 2, borderColor: '#2563eb' },
  tabText:         { fontSize: 14, color: '#888' },
  tabTextActive:   { color: '#2563eb', fontWeight: '600' },
  content:         { flex: 1, paddingHorizontal: 20 },
  item:            { flexDirection: 'row', marginBottom: 16 },
  bullet:          { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2563eb', color: '#fff', textAlign: 'center', lineHeight: 24, fontSize: 13, fontWeight: '700', marginRight: 12, marginTop: 1 },
  itemText:        { flex: 1, fontSize: 15, color: '#333', lineHeight: 22 },
  back:            { margin: 20, backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, alignItems: 'center' },
  backText:        { color: '#374151', fontWeight: '600', fontSize: 15 },
});
