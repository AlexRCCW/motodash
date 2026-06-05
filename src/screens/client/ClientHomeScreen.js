import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { t } from '../../i18n';
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
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('auth.appName')}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate('Instructions')}>
            <Text style={styles.headerBtn}>{t('clientHome.help')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}>
            <Text style={styles.headerBtn}>{t('auth.signOut')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content — simple top-to-bottom stack, no flex distribution */}
      <View style={styles.content}>

        {/* Logo — explicit width so layout is unambiguous */}
        <Image
          source={require('../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Greeting + action cards below */}
        <Text style={styles.greeting}>
          {t('clientHome.greeting', { name: account?.name?.split(' ')[0] })}
        </Text>
        <Text style={styles.subtitle}>{t('clientHome.subtitle')}</Text>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ClientRide')}
        >
          <Text style={styles.actionIcon}>🏍️</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>{t('clientHome.requestRide')}</Text>
            <Text style={styles.actionDesc}>{t('clientHome.requestRideDesc')}</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('ClientStores')}
        >
          <Text style={styles.actionIcon}>🛒</Text>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>{t('clientHome.placeOrder')}</Text>
            <Text style={styles.actionDesc}>{t('clientHome.placeOrderDesc')}</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: '#fff' },
  centered:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header — SafeAreaView now handles the top inset, no manual paddingTop
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    borderBottomWidth: 1,
    borderColor:       '#eee',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a1a' },
  headerRight: { flexDirection: 'row', gap: 16 },
  headerBtn:   { color: '#2563eb', fontSize: 14, fontWeight: '500' },

  // Content — vertical stack, no flex distribution tricks
  content: {
    flex:              1,
    paddingHorizontal: 24,
    paddingBottom:     24,
  },

  // Logo — explicit size avoids any ambiguity with Yoga / Metro @1x resolution
  // 300pt @1x natural width; @2x/@3x variants are picked up automatically
  logo: {
    alignSelf:   'center',
    width:       '78%',          // ~78% of content width (≈300pt on iPhone 14)
    aspectRatio: 2500 / 1920,    // 1.302 — matches source image proportions
    marginTop:   16,
    marginBottom: 8,
  },

  greeting: { fontSize: 26, fontWeight: '700', color: '#1a1a1a', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6b7280', marginBottom: 20 },

  actionCard: {
    flexDirection:  'row',
    alignItems:     'center',
    backgroundColor: '#f8fafc',
    borderRadius:   16,
    padding:        20,
    marginBottom:   12,
    borderWidth:    1,
    borderColor:    '#e2e8f0',
  },
  actionIcon:  { fontSize: 36, marginRight: 16 },
  actionInfo:  { flex: 1 },
  actionTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  actionDesc:  { fontSize: 14, color: '#6b7280', marginTop: 3 },
  actionArrow: { fontSize: 24, color: '#9ca3af' },
});
