import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { register } from '../../services/authService';
import { getDeviceId } from '../../services/deviceService';
import * as Location from 'expo-location';
import { t } from '../../i18n';

const ACCOUNT_TYPE_KEYS = ['client', 'driver', 'store'];
const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];

export default function RegisterScreen({ navigation }) {
  const [step, setStep]               = useState('type');   // 'type' | 'form'
  const [accountType, setAccountType] = useState(null);
  const [deviceId, setDeviceId]       = useState('');
  const [loading, setLoading]         = useState(false);

  // Shared fields
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Driver fields
  const [motorcycleType, setMotorcycleType]   = useState('');
  const [cedulaNumber, setCedulaNumber]       = useState('');
  const [acceptsRides, setAcceptsRides]       = useState(true);
  const [acceptsDeliveries, setAcceptsDeliveries] = useState(true);

  // Store fields
  const [storeName, setStoreName]   = useState('');
  const [openHour, setOpenHour]     = useState('08:00');
  const [closeHour, setCloseHour]   = useState('20:00');
  const [daysOpen, setDaysOpen]     = useState([]);
  const [storeLat, setStoreLat]     = useState(null);
  const [storeLng, setStoreLng]     = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle | loading | done | error

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  async function captureStoreLocation() {
    setLocationStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setLocationStatus('error');
      Alert.alert(t('register.locationRequired'), t('register.locationRequiredMsg'));
      return;
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setStoreLat(loc.coords.latitude);
    setStoreLng(loc.coords.longitude);
    setLocationStatus('done');
  }

  function toggleDay(day) {
    setDaysOpen(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  async function handleRegister() {
    if (!name || !phone || !email || !password) {
      Alert.alert(t('auth.missingFields'), t('auth.pleaseFillAll'));
      return;
    }
    if (accountType === 'driver' && (!motorcycleType || !cedulaNumber)) {
      Alert.alert(t('auth.missingFields'), t('register.missingDriverFields'));
      return;
    }
    if (accountType === 'store') {
      if (!storeName || !openHour || !closeHour || daysOpen.length === 0) {
        Alert.alert(t('auth.missingFields'), t('register.missingStoreFields'));
        return;
      }
      if (!storeLat || !storeLng) {
        Alert.alert(t('register.locationRequired'), t('register.locationRequiredForStore'));
        return;
      }
    }

    setLoading(true);

    const base = { name, phone, email, password, accountType, language: 'en' };
    const profile = accountType === 'driver'
      ? { motorcycleType, cedulaNumber, acceptsRides, acceptsDeliveries }
      : accountType === 'store'
      ? { storeName, openHour, closeHour, daysOpen, locationLat: storeLat, locationLng: storeLng }
      : {};

    const { error } = await register(base, profile);
    setLoading(false);

    if (error) {
      Alert.alert(t('auth.registrationFailed'), error);
    } else {
      Alert.alert(t('auth.createAccount'), t('auth.accountCreated'), [
        { text: t('shared.ok'), onPress: () => navigation.replace('Login') }
      ]);
    }
  }

  // ── STEP 1: choose account type ──
  if (step === 'type') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('auth.createAccount')}</Text>
        <Text style={styles.subtitle}>{t('register.chooseType')}</Text>
        {ACCOUNT_TYPE_KEYS.map(key => (
          <TouchableOpacity
            key={key}
            style={[styles.typeCard, accountType === key && styles.typeCardSelected]}
            onPress={() => setAccountType(key)}
          >
            <Text style={[styles.typeLabel, accountType === key && styles.typeLabelSelected]}>
              {t('register.' + key)}
            </Text>
            <Text style={styles.typeDesc}>{t('register.' + key + 'Desc')}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.button, !accountType && styles.buttonDisabled]}
          disabled={!accountType}
          onPress={() => setStep('form')}
        >
          <Text style={styles.buttonText}>{t('auth.continue')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>{t('auth.back')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP 2: registration form ──
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('auth.createAccount')}</Text>

      {/* Shared fields */}
      <Text style={styles.sectionLabel}>{t('register.yourDetails')}</Text>
      <TextInput style={styles.input} placeholder={t('register.fullName')} placeholderTextColor="#999"
        value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder={t('register.phoneNumber')} placeholderTextColor="#999"
        keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.input} placeholder={t('register.emailAddress')} placeholderTextColor="#999"
        keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder={t('auth.password')} placeholderTextColor="#999"
        secureTextEntry value={password} onChangeText={setPassword} />

      {/* Device ID — read only */}
      <Text style={styles.deviceLabel}>{t('register.deviceId')}</Text>
      <View style={styles.deviceIdBox}>
        <Text style={styles.deviceIdText}>{deviceId || t('shared.loading')}</Text>
      </View>
      <Text style={styles.deviceNote}>{t('register.deviceIdNote')}</Text>

      {/* Driver-specific */}
      {accountType === 'driver' && (
        <>
          <Text style={styles.sectionLabel}>{t('register.driverDetails')}</Text>
          <TextInput style={styles.input} placeholder={t('register.motorcycleType')} placeholderTextColor="#999"
            value={motorcycleType} onChangeText={setMotorcycleType} />
          <TextInput style={styles.input} placeholder={t('register.cedulaNumber')} placeholderTextColor="#999"
            value={cedulaNumber} onChangeText={setCedulaNumber} />
          <Text style={styles.sectionLabel}>{t('register.jobsAccepted')}</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleBtn, acceptsRides && styles.toggleBtnOn]}
              onPress={() => setAcceptsRides(!acceptsRides)}
            >
              <Text style={styles.toggleText}>{t('register.rides')} {acceptsRides ? '✓' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, acceptsDeliveries && styles.toggleBtnOn]}
              onPress={() => setAcceptsDeliveries(!acceptsDeliveries)}
            >
              <Text style={styles.toggleText}>{t('register.deliveries')} {acceptsDeliveries ? '✓' : ''}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Store-specific */}
      {accountType === 'store' && (
        <>
          <Text style={styles.sectionLabel}>{t('register.storeDetails')}</Text>
          <TextInput style={styles.input} placeholder={t('register.storeName')} placeholderTextColor="#999"
            value={storeName} onChangeText={setStoreName} />
          <TextInput style={styles.input} placeholder={t('register.openingHour')} placeholderTextColor="#999"
            value={openHour} onChangeText={setOpenHour} />
          <TextInput style={styles.input} placeholder={t('register.closingHour')} placeholderTextColor="#999"
            value={closeHour} onChangeText={setCloseHour} />
          <Text style={styles.sectionLabel}>{t('register.daysOpen')}</Text>
          <View style={styles.row}>
            {DAYS.map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, daysOpen.includes(day) && styles.dayBtnOn]}
                onPress={() => toggleDay(day)}
              >
                <Text style={styles.dayText}>{t('register.days.' + day)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionLabel}>{t('register.storeLocation')}</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={captureStoreLocation}>
            {locationStatus === 'loading'
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {locationStatus === 'done'
                    ? `${t('register.locationSet')} (${storeLat?.toFixed(5)}, ${storeLng?.toFixed(5)})`
                    : t('register.useMyLocation')}
                </Text>
            }
          </TouchableOpacity>
          {locationStatus === 'error' && (
            <Text style={styles.errorText}>{t('register.locationPermissionDenied')}</Text>
          )}
        </>
      )}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>{t('auth.createAccount')}</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => setStep('type')}>
        <Text style={styles.linkText}>{t('auth.back')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:         { flexGrow: 1, padding: 24, backgroundColor: '#fff' },
  title:             { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: '#1a1a1a', marginTop: 40 },
  subtitle:          { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 24 },
  sectionLabel:      { fontSize: 14, fontWeight: '600', color: '#444', marginTop: 20, marginBottom: 8 },
  input:             { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12, color: '#1a1a1a', backgroundColor: '#fafafa' },
  button:            { backgroundColor: '#2563eb', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled:    { opacity: 0.5 },
  buttonText:        { color: '#fff', fontSize: 16, fontWeight: '600' },
  link:              { marginTop: 16, alignItems: 'center' },
  linkText:          { color: '#2563eb', fontSize: 15 },
  typeCard:          { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, marginBottom: 12 },
  typeCardSelected:  { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  typeLabel:         { fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  typeLabelSelected: { color: '#2563eb' },
  typeDesc:          { fontSize: 14, color: '#666', marginTop: 4 },
  deviceLabel:       { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 16, marginBottom: 6 },
  deviceIdBox:       { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 6 },
  deviceIdText:      { fontSize: 12, color: '#555', fontFamily: 'monospace' },
  deviceNote:        { fontSize: 12, color: '#888', marginBottom: 8 },
  row:               { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  toggleBtn:         { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  toggleBtnOn:       { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  toggleText:        { color: '#1a1a1a', fontWeight: '500' },
  dayBtn:            { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  dayBtnOn:          { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  dayText:           { fontSize: 12, color: '#1a1a1a' },
  locationBtn:       { backgroundColor: '#059669', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  errorText:         { color: '#dc2626', fontSize: 13, marginBottom: 8 },
});
