import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';
import { isNoAdsActive } from '../../services/subscriptionService';
import { t } from '../../i18n';
import { getRideJob, getDeliveryJob } from '../../services/jobService';
import { registerForPushNotifications } from '../../services/notificationService';
import { useThemeColors, SlashDivider, radius } from '../../theme';

export default function ClientHomeScreen({ navigation }) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { account } = useAuth();
  const [checking,    setChecking]    = useState(true);
  const [subscribed,  setSubscribed]  = useState(true);

  useEffect(() => {
    if (account?.id) {
      registerForPushNotifications(account.id);
    }
    isNoAdsActive().then(active => setSubscribed(active));
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
      <View style={styles.root}>
        <SafeAreaView style={styles.hero} edges={['top']}>
          <Image source={require('../../../assets/app-logoV2.png')} style={styles.headerLogo} resizeMode="contain" />
        </SafeAreaView>
        <SlashDivider />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <Image source={require('../../../assets/app-logoV2.png')} style={styles.headerLogo} resizeMode="contain" />
        <View style={styles.heroActions}>
          <TouchableOpacity style={styles.heroBtn} onPress={() => navigation.navigate('Instructions')}>
            <Text style={styles.heroBtnText}>{t('clientHome.help').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroBtn} onPress={() => navigation.navigate('Account')}>
            <Text style={styles.heroBtnText}>{t('account.title').toUpperCase()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.heroBtn, styles.heroBtnRed]} onPress={logout}>
            <Text style={[styles.heroBtnText, styles.heroBtnRedText]}>{t('auth.signOut').toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      {/* Content */}
      <View style={styles.content}>

        {/* Logo */}
        <Image
          source={require('../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        {/* Greeting */}
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
            <Text style={styles.actionTitle}>{t('clientHome.requestRide').toUpperCase()}</Text>
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
            <Text style={styles.actionTitle}>{t('clientHome.placeOrder').toUpperCase()}</Text>
            <Text style={styles.actionDesc}>{t('clientHome.placeOrderDesc')}</Text>
          </View>
          <Text style={styles.actionArrow}>›</Text>
        </TouchableOpacity>

      </View>

      {/* Go Ad Free footer */}
      {!subscribed && (
        <TouchableOpacity style={styles.adFreeFooter} onPress={() => navigation.navigate('Subscription')}>
          <Text style={styles.adFreeText}>{t('account.goAdFree')}</Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  centered:{ flex: 1, justifyContent: 'center', alignItems: 'center' },

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

  content: {
    flex:              1,
    paddingHorizontal: 24,
    paddingBottom:     24,
  },

  logo: {
    alignSelf: 'center',
    height:    160,
    width:     160 * (1263 / 1050),
    marginTop:    16,
    marginBottom: 8,
  },

  greeting: {
    fontSize:   24,
    fontWeight: '500',
    color:      colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize:     15,
    color:        colors.textSecondary,
    marginBottom: 20,
  },

  actionCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    padding:         20,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  actionIcon:  { fontSize: 32, marginRight: 16 },
  actionInfo:  { flex: 1 },
  actionTitle: {
    fontSize:      13,
    fontWeight:    '500',
    color:         colors.textPrimary,
    letterSpacing:  1.5,
    textTransform: 'uppercase',
  },
  actionDesc: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  actionArrow:{ fontSize: 22, color: colors.textSecondary },
  adFreeFooter: {
    paddingVertical:   12,
    alignItems:        'center',
    borderTopWidth:    1,
    borderTopColor:    colors.border,
    backgroundColor:   colors.background,
  },
  adFreeText: {
    fontSize:      16,
    fontWeight:    '600',
    color:         colors.primary,
    letterSpacing: 0.5,
  },
});
