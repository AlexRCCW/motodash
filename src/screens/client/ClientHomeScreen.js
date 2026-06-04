import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { getRideJob, getDeliveryJob } from '../../services/jobService';
import { registerForPushNotifications } from '../../services/notificationService';

export default function ClientHomeScreen({ navigation }) {
  const { account } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (account?.id) {
      registerForPushNotifications(account.id);
    }
    checkOpenJob();
  }, []);

  async function checkOpenJob() {
    setChecking(true);
    try {
      const openJob  = await AsyncStorage.getItem('open_job');
      const jobType  = await AsyncStorage.getItem('open_job_type');
      const jobId    = await AsyncStorage.getItem('open_job_id');

      if (openJob === 'true' && jobId) {
        if (jobType === 'ride') {
          const { data } = await getRideJob(jobId);
          if (data && !data.client_complete) {
            navigation.replace('ClientRide', { job: data, resuming: true });
            return;
          }
        } else if (jobType === 'delivery') {
          const { data } = await getDeliveryJob(jobId);
          if (data && !data.client_complete) {
            navigation.replace('ClientOrder', { job: data, resuming: true });
            return;
          }
        }
        // Job is complete — clear stale flag
        await AsyncStorage.multiRemove(['open_job', 'open_job_type', 'open_job_id']);
      }
    } catch (e) {
      console.error('Open job check error:', e);
    }
    setChecking(false);
  }

  if (checking) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>MotoDash</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Instructions')}>
            <Text style={styles.headerBtn}>Help</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.headerBtn}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.greeting}>
          Hello, {account?.name?.split(' ')[0]} 👋
        </Text>
        <Text style={styles.subtitle}>What do you need today?</Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ClientRide')}
        >
          <Text style={styles.actionIcon}>🏍️</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Request a ride</Text>
            <Text style={styles.actionDesc}>
              Get picked up and taken to your destination
            </Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ClientStores')}
        >
          <Text style={styles.actionIcon}>🛒</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Place an order</Text>
            <Text style={styles.actionDesc}>
              Order groceries from stores near you
            </Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fff' },
  centered:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#eee' },
  headerTitle:  { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  headerRight:  { flexDirection: 'row', gap: 16 },
  headerBtn:    { color: '#2563eb', fontSize: 14, fontWeight: '500' },
  content:      { flex: 1, padding: 24, justifyContent: 'center' },
  greeting:     { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 6 },
  subtitle:     { fontSize: 16, color: '#6b7280', marginBottom: 32 },
  actionCard:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  actionIcon:   { fontSize: 36, marginRight: 16 },
  actionInfo:   { flex: 1 },
  actionTitle:  { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  actionDesc:   { fontSize: 14, color: '#6b7280', marginTop: 3 },
  actionArrow:  { fontSize: 24, color: '#9ca3af' },
});
