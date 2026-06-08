import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login } from '../../services/authService';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

export default function LoginScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert(t('shared.error'), t('auth.fillFields'));
      return;
    }
    setLoading(true);
    const { error } = await login(email.trim(), password);
    setLoading(false);
    if (error) {
      Alert.alert(t('auth.loginFailed'), error);
    }
  }

  return (
    <View style={styles.root}>
      {/* ── Hero panel ── */}
      <SafeAreaView style={styles.hero} edges={['top']}>
        <View style={styles.heroInner}>
          <Text style={styles.heroTitle}>MOTODASH</Text>
        </View>
      </SafeAreaView>

      {/* ── Red slash divider ── */}
      <SlashDivider />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Image
          source={require('../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.subtitle}>{t('auth.signInSubtitle')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('auth.email')}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={colors.onDark} />
            : <Text style={styles.buttonText}>{t('auth.signIn').toUpperCase()}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>{t('auth.noAccount').toUpperCase()}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Instructions')}>
          <Text style={styles.linkText}>{t('auth.howItWorks').toUpperCase()}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  // ── Hero panel ──
  hero: { backgroundColor: colors.hero },
  heroInner: {
    paddingHorizontal: 24,
    paddingTop:        10,
    paddingBottom:     14,
    alignItems:        'center',
  },
  heroTitle: { fontSize: 18, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },

  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: {
    alignSelf:    'center',
    width:        '72%',
    aspectRatio:  2500 / 1920,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, textAlign: 'center', color: colors.textSecondary, marginBottom: 32 },
  input: {
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    padding:           14,
    fontSize:          16,
    marginBottom:      16,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius:    radius.md,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:       8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color:         colors.onDark,
    fontSize:      13,
    fontWeight:    '500',
    letterSpacing:  2,
  },
  link:     { marginTop: 20, alignItems: 'center' },
  linkText: {
    color:         colors.textSecondary,
    fontSize:      11,
    letterSpacing:  1.5,
    fontWeight:    '500',
  },
});
