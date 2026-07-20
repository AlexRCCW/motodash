import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useTheme, SlashDivider, radius } from '../../theme';
import { supabase } from '../../config/supabase';
import { t } from '../../i18n';
import { isNoAdsActive, restorePurchases } from '../../services/subscriptionService';
import AnimatedPressButton from '../../components/AnimatedPressButton';

const MODES = ['auto', 'light', 'dark'];

export default function AccountScreen({ navigation }) {
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { account, refreshAccount } = useAuth();

  const [phone,       setPhone]       = useState(account?.phone ?? '');
  const [currentPw,   setCurrentPw]   = useState('');
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [subscribed,  setSubscribed]  = useState(false);
  const [savingPhone,  setSavingPhone]  = useState(false);
  const [savingPw,     setSavingPw]     = useState(false);
  const [restoring,    setRestoring]    = useState(false);
  const [deletingAcct, setDeletingAcct] = useState(false);

  useEffect(() => {
    isNoAdsActive().then(setSubscribed);
  }, []);

  async function handleSavePhone() {
    if (!phone.trim()) return;
    setSavingPhone(true);
    const { error } = await supabase
      .from('accounts')
      .update({ phone: phone.trim() })
      .eq('id', account.id);
    setSavingPhone(false);
    if (error) {
      Alert.alert(t('shared.error'), error.message);
    } else {
      await refreshAccount();
      Alert.alert(t('account.saved'), t('account.phoneSaved'));
    }
  }

  async function handleChangePassword() {
    if (!newPw || newPw !== confirmPw) {
      Alert.alert(t('shared.error'), t('account.passwordMismatch'));
      return;
    }
    if (newPw.length < 6) {
      Alert.alert(t('shared.error'), t('account.passwordTooShort'));
      return;
    }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      Alert.alert(t('shared.error'), error.message);
    } else {
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      Alert.alert(t('account.saved'), t('account.passwordSaved'));
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const { success, active, error } = await restorePurchases();
    setRestoring(false);
    if (!success) { Alert.alert(t('shared.error'), error); return; }
    setSubscribed(active);
    Alert.alert(
      active ? t('subscription.restoredTitle') : t('subscription.noRestoreTitle'),
      active ? t('subscription.restoredMsg')   : t('subscription.noRestoreMsg'),
    );
  }

  function handleCancelSubscription() {
    Alert.alert(
      t('account.cancelSubTitle'),
      t('account.cancelSubMsg'),
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('account.manageInApple'),
          onPress: () => {
            // Deep link to Apple subscription management
            const { Linking } = require('react-native');
            Linking.openURL('https://apps.apple.com/account/subscriptions');
          },
        },
      ]
    );
  }

  async function handleDeleteAccount() {
    Alert.alert(
      t('account.deleteTitle'),
      t('account.deleteMsg'),
      [
        { text: t('shared.cancel'), style: 'cancel' },
        {
          text: t('account.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            setDeletingAcct(true);
            try {
              // Delete all user data from accounts table (cascade handles related rows)
              const { error: dbError } = await supabase
                .from('accounts')
                .delete()
                .eq('id', account.id);
              if (dbError) throw dbError;
              // Delete the auth user
              const { error: authError } = await supabase.rpc('delete_own_account');
              if (authError) throw authError;
              await supabase.auth.signOut();
            } catch (e) {
              setDeletingAcct(false);
              Alert.alert(t('shared.error'), e?.message ?? t('account.deleteError'));
            }
          },
        },
      ]
    );
  }

  const modeLabel = { auto: t('account.modeAuto'), light: t('account.modeLight'), dark: t('account.modeDark') };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.hero} edges={['top']}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ {t('shared.back').toUpperCase()}</Text>
        </TouchableOpacity>
        <Text style={styles.heroTitle}>{t('account.title').toUpperCase()}</Text>
      </SafeAreaView>
      <SlashDivider />

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ── Account info ── */}
        <Text style={styles.sectionTitle}>{t('account.info').toUpperCase()}</Text>
        <View style={styles.card}>
          <Row label={t('account.email')} value={account?.email ?? '—'} colors={colors} />
          <Row label={t('account.type')}  value={account?.account_type ?? '—'} colors={colors} />
          <Row label={t('account.name')}  value={account?.name ?? '—'}   colors={colors} />
        </View>

        {/* ── Phone ── */}
        <Text style={styles.sectionTitle}>{t('account.phone').toUpperCase()}</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('account.phonePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            keyboardType="phone-pad"
          />
          <AnimatedPressButton
            style={[styles.btn, styles.btnPrimary, savingPhone && styles.btnDisabled]}
            onPress={handleSavePhone}
            disabled={savingPhone}
          >
            {savingPhone
              ? <ActivityIndicator color={colors.onDark} />
              : <Text style={styles.btnText}>{t('account.save').toUpperCase()}</Text>
            }
          </AnimatedPressButton>
        </View>

        {/* ── Password ── */}
        <Text style={styles.sectionTitle}>{t('account.changePassword').toUpperCase()}</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={newPw}
            onChangeText={setNewPw}
            placeholder={t('account.newPassword')}
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={confirmPw}
            onChangeText={setConfirmPw}
            placeholder={t('account.confirmPassword')}
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
          />
          <AnimatedPressButton
            style={[styles.btn, styles.btnPrimary, savingPw && styles.btnDisabled]}
            onPress={handleChangePassword}
            disabled={savingPw}
          >
            {savingPw
              ? <ActivityIndicator color={colors.onDark} />
              : <Text style={styles.btnText}>{t('account.updatePassword').toUpperCase()}</Text>
            }
          </AnimatedPressButton>
        </View>

        {/* ── Subscription ── */}
        <Text style={styles.sectionTitle}>{t('account.subscription').toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.subStatusRow}>
            <Text style={styles.subStatusLabel}>{t('account.status')}</Text>
            <Text style={[styles.subStatusValue, subscribed && styles.subStatusActive]}>
              {subscribed ? t('account.subActive') : t('account.subInactive')}
            </Text>
          </View>
          {subscribed ? (
            <>
              <AnimatedPressButton style={[styles.btn, styles.btnDanger]} onPress={handleCancelSubscription}>
                <Text style={styles.btnText}>{t('account.manageSubscription').toUpperCase()}</Text>
              </AnimatedPressButton>
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
            </>
          ) : (
            <>
              <AnimatedPressButton
                style={[styles.btn, styles.btnPrimary]}
                onPress={() => navigation.navigate('Subscription')}
              >
                <Text style={styles.btnText}>{t('account.goAdFree').toUpperCase()}</Text>
              </AnimatedPressButton>
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
            </>
          )}
        </View>

        {/* ── Display mode ── */}
        <Text style={styles.sectionTitle}>{t('account.displayMode').toUpperCase()}</Text>
        <View style={styles.card}>
          <View style={styles.modeRow}>
            {MODES.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
                onPress={() => setMode(m)}
              >
                <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
                  {modeLabel[m].toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.modeHint}>{t('account.modeAutoHint')}</Text>
        </View>

        {/* ── Delete account ── */}
        <Text style={styles.sectionTitle}>{t('account.dangerZone').toUpperCase()}</Text>
        <View style={styles.card}>
          <Text style={styles.deleteHint}>{t('account.deleteHint')}</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnDeleteAccount, deletingAcct && styles.btnDisabled]}
            onPress={handleDeleteAccount}
            disabled={deletingAcct}
          >
            {deletingAcct
              ? <ActivityIndicator color="#c0392b" />
              : <Text style={styles.btnTextDelete}>{t('account.deleteAccount').toUpperCase()}</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, colors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 12, color: colors.textSecondary, fontWeight: '500', letterSpacing: 1 }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  hero:  { backgroundColor: colors.hero, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  backBtn:  { marginBottom: 6 },
  backText: { fontSize: 11, color: '#ffffff', letterSpacing: 1.5, fontWeight: '500' },
  heroTitle:{ fontSize: 18, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },

  scroll: { padding: 16 },

  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 8, marginTop: 20,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         16,
    marginBottom:    4,
  },

  input: {
    backgroundColor: colors.background,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.sm,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:        14,
    color:           colors.textPrimary,
  },

  btn: {
    marginTop:       12,
    paddingVertical: 12,
    borderRadius:    radius.md,
    alignItems:      'center',
  },
  btnPrimary:       { backgroundColor: colors.primary },
  btnSecondary:     { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  btnDanger:        { backgroundColor: 'rgba(192,57,43,0.15)', borderWidth: 1, borderColor: colors.primary },
  btnDisabled:      { opacity: 0.5 },
  btnText:          { fontSize: 12, fontWeight: '600', color: colors.onDark, letterSpacing: 1.5 },
  btnTextSecondary: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, letterSpacing: 1.5 },

  subStatusRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  subStatusLabel:{ fontSize: 13, color: colors.textSecondary },
  subStatusValue:{ fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  subStatusActive:{ color: '#27ae60' },

  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.background,
  },
  modeBtnActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
  modeBtnText:      { fontSize: 11, fontWeight: '500', color: colors.textSecondary, letterSpacing: 1 },
  modeBtnTextActive:{ color: colors.onDark },
  modeHint: { fontSize: 11, color: colors.textSecondary, marginTop: 10, lineHeight: 16 },

  deleteHint:       { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 4 },
  btnDeleteAccount: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#c0392b' },
  btnTextDelete:    { fontSize: 12, fontWeight: '600', color: '#c0392b', letterSpacing: 1.5 },
});
