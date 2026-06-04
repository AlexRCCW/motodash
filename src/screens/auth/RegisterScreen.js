import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert
} from 'react-native';
import { register } from '../../services/authService';
import { getDeviceId } from '../../services/deviceService';
import * as Location from 'expo-location';

const ACCOUNT_TYPES = [
  { key: 'client', label: 'Client',  desc: 'I need rides and deliveries' },
  { key: 'driver', label: 'Driver',  desc: 'I provide rides and deliveries' },
  { key: 'store',  label: 'Store',   desc: 'I sell items for delivery' },
];

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const DAY_LABELS = { mon:'Mon', tue:'Tue', wed:'Wed', thu:'Thu', fri:'Fri', sat:'Sat', sun:'Sun' };

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
      Alert.alert('Permission denied', 'Location permission is required to set your store location.');
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
      Alert.alert('Missing fields', 'Please fill in all required fields.');
      return;
    }
    if (accountType === 'driver' && (!motorcycleType || !cedulaNumber)) {
      Alert.alert('Missing fields', 'Please fill in your motorcycle type and cedula number.');
      return;
    }
    if (accountType === 'store') {
      if (!storeName || !openHour || !closeHour || daysOpen.length === 0) {
        Alert.alert('Missing fields', 'Please fill in all store details.');
        return;
      }
      if (!storeLat || !storeLng) {
        Alert.alert('Location required', 'Please capture your store location before registering.');
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
      Alert.alert('Registration failed', error);
    } else {
      Alert.alert('Success', 'Account created! Please sign in.', [
        { text: 'OK', onPress: () => navigation.replace('Login') }
      ]);
    }
  }

  // ── STEP 1: choose account type ──
  if (step === 'type') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>What best describes you?</Text>
        {ACCOUNT_TYPES.map(type => (
          <TouchableOpacity
            key={type.key}
            style={[styles.typeCard, accountType === type.key && styles.typeCardSelected]}
            onPress={() => setAccountType(type.key)}
          >
            <Text style={[styles.typeLabel, accountType === type.key && styles.typeLabelSelected]}>
              {type.label}
            </Text>
            <Text style={styles.typeDesc}>{type.desc}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.button, !accountType && styles.buttonDisabled]}
          disabled={!accountType}
          onPress={() => setStep('form')}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>Back to login</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── STEP 2: registration form ──
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>
        {accountType.charAt(0).toUpperCase() + accountType.slice(1)} registration
      </Text>

      {/* Shared fields */}
      <Text style={styles.sectionLabel}>Your details</Text>
      <TextInput style={styles.input} placeholder="Full name" placeholderTextColor="#999"
        value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="Phone number" placeholderTextColor="#999"
        keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextInput style={styles.input} placeholder="Email address" placeholderTextColor="#999"
        keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#999"
        secureTextEntry value={password} onChangeText={setPassword} />

      {/* Device ID — read only */}
      <Text style={styles.deviceLabel}>Device ID (auto-detected)</Text>
      <View style={styles.deviceIdBox}>
        <Text style={styles.deviceIdText}>{deviceId || 'Loading...'}</Text>
      </View>
      <Text style={styles.deviceNote}>
        We store your device ID to keep the app safe and prevent abuse.
      </Text>

      {/* Driver-specific */}
      {accountType === 'driver' && (
        <>
          <Text style={styles.sectionLabel}>Driver details</Text>
          <TextInput style={styles.input} placeholder="Motorcycle type" placeholderTextColor="#999"
            value={motorcycleType} onChangeText={setMotorcycleType} />
          <TextInput style={styles.input} placeholder="Cedula number" placeholderTextColor="#999"
            value={cedulaNumber} onChangeText={setCedulaNumber} />
          <Text style={styles.sectionLabel}>Jobs I accept</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.toggleBtn, acceptsRides && styles.toggleBtnOn]}
              onPress={() => setAcceptsRides(!acceptsRides)}
            >
              <Text style={styles.toggleText}>Rides {acceptsRides ? '✓' : ''}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, acceptsDeliveries && styles.toggleBtnOn]}
              onPress={() => setAcceptsDeliveries(!acceptsDeliveries)}
            >
              <Text style={styles.toggleText}>Deliveries {acceptsDeliveries ? '✓' : ''}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Store-specific */}
      {accountType === 'store' && (
        <>
          <Text style={styles.sectionLabel}>Store details</Text>
          <TextInput style={styles.input} placeholder="Store name" placeholderTextColor="#999"
            value={storeName} onChangeText={setStoreName} />
          <TextInput style={styles.input} placeholder="Opening hour (e.g. 08:00)" placeholderTextColor="#999"
            value={openHour} onChangeText={setOpenHour} />
          <TextInput style={styles.input} placeholder="Closing hour (e.g. 20:00)" placeholderTextColor="#999"
            value={closeHour} onChangeText={setCloseHour} />
          <Text style={styles.sectionLabel}>Days open</Text>
          <View style={styles.row}>
            {DAYS.map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, daysOpen.includes(day) && styles.dayBtnOn]}
                onPress={() => toggleDay(day)}
              >
                <Text style={styles.dayText}>{DAY_LABELS[day]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionLabel}>Store location</Text>
          <TouchableOpacity style={styles.locationBtn} onPress={captureStoreLocation}>
            {locationStatus === 'loading'
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>
                  {locationStatus === 'done'
                    ? `Location set ✓ (${storeLat?.toFixed(5)}, ${storeLng?.toFixed(5)})`
                    : 'Use my current location'}
                </Text>
            }
          </TouchableOpacity>
          {locationStatus === 'error' && (
            <Text style={styles.errorText}>Location permission denied. Please enable it in settings.</Text>
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
          : <Text style={styles.buttonText}>Create account</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => setStep('type')}>
        <Text style={styles.linkText}>Back</Text>
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
