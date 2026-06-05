import React, { useState } from 'react';
import {
  Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { login } from '../../services/authService';
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
    <SafeAreaView style={styles.safeArea}>
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
          placeholderTextColor="#999"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder={t('auth.password')}
          placeholderTextColor="#999"
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
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>{t('auth.noAccount')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.link} onPress={() => navigation.navigate('Instructions')}>
          <Text style={styles.linkText}>{t('auth.howItWorks')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: '#fff' },
  container:     { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: {
    alignSelf:    'center',
    width:        '72%',
    aspectRatio:  2500 / 1920,
    marginBottom: 8,
  },
  subtitle:      { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 32 },
  input:         { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 16, color: '#1a1a1a', backgroundColor: '#fafafa' },
  button:        { backgroundColor: '#2563eb', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled:{ opacity: 0.6 },
  buttonText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
  link:          { marginTop: 20, alignItems: 'center' },
  linkText:      { color: '#2563eb', fontSize: 15 },
});
