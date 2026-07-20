import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeColors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';
import {
  isNoAdsActive, getNoAdsPackage, purchaseNoAds, restorePurchases,
} from '../../services/subscriptionService';

export default function SubscriptionScreen({ navigation }) {
  const { colors } = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pkg,        setPkg]        = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring,  setRestoring]  = useState(false);

  useEffect(() => {
    (async () => {
      const [active, monthly] = await Promise.all([isNoAdsActive(), getNoAdsPackage()]);
      setSubscribed(active);
      setPkg(monthly);
      setLoading(false);
    })();
  }, []);

  async function handleSubscribe() {
    setPurchasing(true);
    const { success, error } = await purchaseNoAds();
    setPurchasing(false);
    if (success) {
      setSubscribed(true);
      Alert.alert(t('subscription.successTitle'), t('subscription.successMsg'));
    } else if (error) {
      Alert.alert(t('shared.error'), error);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const { success, active, error } = await restorePurchases();
    setRestoring(false);
    if (!success) {
      Alert.alert(t('shared.error'), error);
      return;
    }
    if (active) {
      setSubscribed(true);
      Alert.alert(t('subscription.restoredTitle'), t('subscription.restoredMsg'));
    } else {
      Alert.alert(t('subscription.noRestoreTitle'), t('subscription.noRestoreMsg'));
    }
  }

  const priceLabel = pkg?.product?.priceString ?? '$2.99';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.hero} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ {t('shared.back').toUpperCase()}</Text>
        </TouchableOpacity>
        <Text style={styles.heroTitle}>{t('subscription.title').toUpperCase()}</Text>
      </SafeAreaView>
      <SlashDivider />

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : subscribed ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>{t('subscription.activeTitle').toUpperCase()}</Text>
            <Text style={styles.activeBody}>{t('subscription.activeBody')}</Text>
          </View>
        ) : (
          <>
            <View style={styles.benefitCard}>
              <Text style={styles.benefitTitle}>{t('subscription.benefitTitle').toUpperCase()}</Text>
              <View style={styles.benefitList}>
                <Text style={styles.benefitItem}>✓  {t('subscription.benefit1')}</Text>
                <Text style={styles.benefitItem}>✓  {t('subscription.benefit2')}</Text>
                <Text style={styles.benefitItem}>✓  {t('subscription.benefit3')}</Text>
              </View>
              <Text style={styles.price}>
                {priceLabel}<Text style={styles.pricePer}> / {t('subscription.perMonth')}</Text>
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, purchasing && styles.btnDisabled]}
              onPress={handleSubscribe}
              disabled={purchasing}
            >
              {purchasing
                ? <ActivityIndicator color={colors.onDark} />
                : <Text style={styles.btnText}>{t('subscription.subscribe').toUpperCase()}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary, restoring && styles.btnDisabled]}
              onPress={handleRestore}
              disabled={restoring}
            >
              {restoring
                ? <ActivityIndicator color={colors.textSecondary} />
                : <Text style={styles.btnTextSecondary}>{t('subscription.restore').toUpperCase()}</Text>
              }
            </TouchableOpacity>

            <Text style={styles.legal}>{t('subscription.legal')}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root:    { flex: 1, backgroundColor: colors.background },
  hero:    { backgroundColor: colors.hero, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  backBtn: { marginBottom: 6 },
  backText:{ fontSize: 11, color: '#ffffff', letterSpacing: 1.5, fontWeight: '500' },
  heroTitle: { fontSize: 18, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },

  content: { flex: 1, padding: 20 },
  loader:  { marginTop: 60 },

  activeCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    borderLeftWidth: 4,
    borderLeftColor: '#27ae60',
    padding:         20,
    marginTop:       12,
  },
  activeTitle: {
    fontSize:      12,
    fontWeight:    '600',
    color:         '#27ae60',
    letterSpacing: 1.5,
    marginBottom:  8,
  },
  activeBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 22 },

  benefitCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         20,
    marginBottom:    20,
  },
  benefitTitle: {
    fontSize:      11,
    fontWeight:    '600',
    color:         colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom:  16,
  },
  benefitList:  { gap: 10, marginBottom: 20 },
  benefitItem:  { fontSize: 14, color: colors.textPrimary, lineHeight: 22 },
  price: {
    fontSize:   28,
    fontWeight: '700',
    color:      colors.primary,
    marginTop:  4,
  },
  pricePer: { fontSize: 14, fontWeight: '400', color: colors.textSecondary },

  btn: {
    paddingVertical: 14,
    borderRadius:    radius.md,
    alignItems:      'center',
    marginBottom:    12,
  },
  btnPrimary:   { backgroundColor: colors.primary },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderWidth:     1,
    borderColor:     colors.border,
  },
  btnDisabled:       { opacity: 0.5 },
  btnText:           { fontSize: 13, fontWeight: '600', color: colors.onDark, letterSpacing: 1.5 },
  btnTextSecondary:  { fontSize: 13, fontWeight: '500', color: colors.textSecondary, letterSpacing: 1.5 },

  legal: {
    fontSize:   11,
    color:      colors.textSecondary,
    textAlign:  'center',
    lineHeight: 18,
    marginTop:  8,
  },
});
