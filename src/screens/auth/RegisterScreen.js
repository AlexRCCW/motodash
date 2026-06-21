import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { register } from '../../services/authService';
import { uploadStorefrontPhoto } from '../../services/jobService';
import { getDeviceId } from '../../services/deviceService';
import { supabase } from '../../config/supabase';
import { t } from '../../i18n';

const ACCOUNT_TYPE_KEYS = ['client', 'driver', 'store'];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const STORE_TYPES = [
  { key: 'grocery',    icon: '🛒' },
  { key: 'general',    icon: '🏪' },
  { key: 'restaurant', icon: '🍽️' },
  { key: 'hardware',   icon: '🔧' },
  { key: 'clothing',   icon: '👕' },
  { key: 'food_cart',  icon: '🌮' },
];

// Santo Domingo default — used if GPS is unavailable
const DR_DEFAULT = { latitude: 18.4861, longitude: -69.9312 };

export default function RegisterScreen({ navigation }) {
  const [step, setStep]               = useState('type');
  const [accountType, setAccountType] = useState(null);
  const [deviceId, setDeviceId]       = useState('');
  const [loading, setLoading]         = useState(false);

  // Disable parent scroll while user's finger is on the map
  const [parentScrollEnabled, setParentScrollEnabled] = useState(true);

  // Shared fields
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Driver fields
  const [motorcycleType, setMotorcycleType]         = useState('');
  const [cedulaNumber, setCedulaNumber]             = useState('');
  const [acceptsRides, setAcceptsRides]             = useState(true);
  const [acceptsDeliveries, setAcceptsDeliveries]   = useState(true);

  // Store fields
  const [storeType, setStoreType]   = useState(null);
  const [storeName, setStoreName]   = useState('');
  const [openHour, setOpenHour]     = useState('08:00');
  const [closeHour, setCloseHour]   = useState('20:00');
  const [daysOpen, setDaysOpen]     = useState([]);
  const [storeLat, setStoreLat]     = useState(null);
  const [storeLng, setStoreLng]     = useState(null);
  const [mapRegion, setMapRegion]   = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle'); // idle|loading|done|error

  // Store photo
  const [storePhotoUri,    setStorePhotoUri]    = useState(null);
  const [storePhotoBase64, setStorePhotoBase64] = useState(null);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
  }, []);

  // Auto-get location when store form opens
  useEffect(() => {
    if (step === 'form' && accountType === 'store') {
      initStoreLocation();
    }
  }, [step, accountType]);

  // ── Location ────────────────────────────────────────────────

  async function initStoreLocation() {
    setLocationStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      setLocationStatus('error');
      // Fall back to Santo Domingo so the map still shows
      setStoreLat(DR_DEFAULT.latitude);
      setStoreLng(DR_DEFAULT.longitude);
      setMapRegion({ ...DR_DEFAULT, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      return;
    }

    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      setStoreLat(latitude);
      setStoreLng(longitude);
      setMapRegion({ latitude, longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
      setLocationStatus('done');
    } catch {
      setLocationStatus('error');
      setStoreLat(DR_DEFAULT.latitude);
      setStoreLng(DR_DEFAULT.longitude);
      setMapRegion({ ...DR_DEFAULT, latitudeDelta: 0.005, longitudeDelta: 0.005 });
    }
  }

  function handleMapPress(e) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setStoreLat(latitude);
    setStoreLng(longitude);
    if (locationStatus !== 'done') setLocationStatus('done');
  }

  function handleMarkerDrag(e) {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setStoreLat(latitude);
    setStoreLng(longitude);
  }

  // ── Store photo ─────────────────────────────────────────────

  function promptStorePhoto() {
    Alert.alert(
      t('register.storefrontPhoto'),
      '',
      [
        { text: t('storeItems.takePhoto'),   onPress: () => pickStorePhoto('camera')  },
        { text: t('storeItems.choosePhoto'), onPress: () => pickStorePhoto('library') },
        { text: t('shared.cancel'), style: 'cancel' },
      ]
    );
  }

  async function pickStorePhoto(source) {
    let result;

    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('shared.error'), 'Camera permission denied.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       1,
      });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('shared.error'), 'Photo library permission denied.');
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:    ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect:        [1, 1],
        quality:       1,
      });
    }

    if (!result.canceled && result.assets?.length > 0) {
      // Resize to 800×800 — storefront photos are larger than product thumbnails
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setStorePhotoUri(resized.uri);
      setStorePhotoBase64(resized.base64);
    }
  }

  // ── Day toggles ─────────────────────────────────────────────

  function toggleDay(day) {
    setDaysOpen(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  // ── Submit ──────────────────────────────────────────────────

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
      if (!storeType) {
        Alert.alert(t('auth.missingFields'), t('register.storeTypeRequired'));
        return;
      }
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

    const base    = { name, phone, email, password, accountType, language: 'en' };
    const profile = accountType === 'driver'
      ? { motorcycleType, cedulaNumber, acceptsRides, acceptsDeliveries }
      : accountType === 'store'
      ? { storeType, storeName, openHour, closeHour, daysOpen, locationLat: storeLat, locationLng: storeLng }
      : {};

    const { userId, error } = await register(base, profile);

    if (error) {
      setLoading(false);
      Alert.alert(t('auth.registrationFailed'), error);
      return;
    }

    // Upload storefront photo if taken (non-blocking on error — store still created)
    if (accountType === 'store' && storePhotoBase64 && userId) {
      const { url, error: photoError } = await uploadStorefrontPhoto(userId, storePhotoBase64);
      if (!photoError && url) {
        await supabase
          .from('store_profiles')
          .update({ storefront_image_url: url })
          .eq('id', userId);
      }
    }

    setLoading(false);
    Alert.alert(t('auth.createAccount'), t('auth.accountCreated'), [
      { text: t('shared.ok'), onPress: () => navigation.replace('Login') },
    ]);
  }

  // ── STEP 1: Choose account type ─────────────────────────────

  if (step === 'type') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
      </KeyboardAvoidingView>
    );
  }

  // ── STEP 2: Registration form ────────────────────────────────

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      scrollEnabled={parentScrollEnabled}
    >
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

      {/* Device ID */}
      <Text style={styles.deviceLabel}>{t('register.deviceId')}</Text>
      <View style={styles.deviceIdBox}>
        <Text style={styles.deviceIdText}>{deviceId || t('shared.loading')}</Text>
      </View>
      <Text style={styles.deviceNote}>{t('register.deviceIdNote')}</Text>

      {/* ── Driver fields ── */}
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
              <Text style={[styles.toggleText, acceptsRides && styles.toggleTextOn]}>
                {t('register.rides')} {acceptsRides ? '✓' : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, acceptsDeliveries && styles.toggleBtnOn]}
              onPress={() => setAcceptsDeliveries(!acceptsDeliveries)}
            >
              <Text style={[styles.toggleText, acceptsDeliveries && styles.toggleTextOn]}>
                {t('register.deliveries')} {acceptsDeliveries ? '✓' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* ── Store fields ── */}
      {accountType === 'store' && (
        <>
          <Text style={styles.sectionLabel}>{t('register.storeDetails')}</Text>

          {/* ── Store type selector ── */}
          <Text style={styles.fieldLabel}>{t('register.storeType')}</Text>
          <View style={styles.storeTypeGrid}>
            {STORE_TYPES.map(({ key, icon }) => {
              const selected = storeType === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.storeTypeBtn, selected && styles.storeTypeBtnOn]}
                  onPress={() => setStoreType(key)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.storeTypeIcon}>{icon}</Text>
                  <Text style={[styles.storeTypeLabel, selected && styles.storeTypeLabelOn]}>
                    {t('register.storeTypes.' + key)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Storefront photo ── */}
          <Text style={styles.fieldLabel}>{t('register.storefrontPhoto')}</Text>
          <Text style={styles.fieldHint}>{t('register.storefrontPhotoHint')}</Text>
          <TouchableOpacity
            style={styles.photoPicker}
            onPress={promptStorePhoto}
            activeOpacity={0.8}
          >
            {storePhotoUri ? (
              <>
                <Image source={{ uri: storePhotoUri }} style={styles.photoPreview} resizeMode="cover" />
                <View style={styles.photoOverlay}>
                  <Text style={styles.photoOverlayText}>{t('storeItems.changePhoto')}</Text>
                </View>
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📷</Text>
                <Text style={styles.photoPlaceholderLabel}>{t('register.addStorefrontPhoto')}</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* ── Store info fields ── */}
          <TextInput style={styles.input} placeholder={t('register.storeName')} placeholderTextColor="#999"
            value={storeName} onChangeText={setStoreName} />
          <TextInput style={styles.input} placeholder={t('register.openingHour')} placeholderTextColor="#999"
            value={openHour} onChangeText={setOpenHour} />
          <TextInput style={styles.input} placeholder={t('register.closingHour')} placeholderTextColor="#999"
            value={closeHour} onChangeText={setCloseHour} />

          {/* ── Days open ── */}
          <Text style={styles.sectionLabel}>{t('register.daysOpen')}</Text>
          <View style={styles.row}>
            {DAYS.map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, daysOpen.includes(day) && styles.dayBtnOn]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[styles.dayText, daysOpen.includes(day) && styles.dayTextOn]}>
                  {t('register.days.' + day)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Store location map ── */}
          <Text style={styles.sectionLabel}>{t('register.storeLocation')}</Text>

          {locationStatus === 'loading' ? (
            <View style={styles.mapLoading}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.mapLoadingText}>{t('register.gettingLocation')}</Text>
            </View>
          ) : mapRegion ? (
            <>
              <Text style={styles.fieldHint}>{t('register.dragPinHint')}</Text>
              {locationStatus === 'error' && (
                <Text style={styles.warningText}>{t('register.locationDefaulted')}</Text>
              )}
              {/* Touch wrapper: disables parent ScrollView while finger is on map */}
              <View
                onTouchStart={() => setParentScrollEnabled(false)}
                onTouchEnd={() => setParentScrollEnabled(true)}
                onTouchCancel={() => setParentScrollEnabled(true)}
              >
                <MapView
                  style={styles.map}
                  initialRegion={mapRegion}
                  scrollEnabled={true}
                  zoomEnabled={true}
                  onPress={handleMapPress}
                >
                  {storeLat && storeLng && (
                    <Marker
                      coordinate={{ latitude: storeLat, longitude: storeLng }}
                      draggable
                      onDragEnd={handleMarkerDrag}
                    />
                  )}
                </MapView>
              </View>
              {storeLat && storeLng && (
                <Text style={styles.coordsText}>
                  {t('register.coordinates', {
                    lat: storeLat.toFixed(5),
                    lng: storeLng.toFixed(5),
                  })}
                </Text>
              )}
            </>
          ) : null}
        </>
      )}

      {/* Submit */}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:     { flexGrow: 1, padding: 24, backgroundColor: '#fff' },
  title:         { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 8, color: '#1a1a1a', marginTop: 40 },
  subtitle:      { fontSize: 16, textAlign: 'center', color: '#666', marginBottom: 24 },
  sectionLabel:  { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldLabel:    { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  fieldHint:     { fontSize: 13, color: '#6b7280', marginBottom: 10, lineHeight: 18 },
  warningText:   { fontSize: 13, color: '#d97706', marginBottom: 8, fontWeight: '500' },
  input:         { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 14, fontSize: 16, marginBottom: 12, color: '#1a1a1a', backgroundColor: '#fafafa' },
  button:        { backgroundColor: '#2563eb', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  buttonDisabled:{ opacity: 0.5 },
  buttonText:    { color: '#fff', fontSize: 16, fontWeight: '600' },
  link:          { marginTop: 16, alignItems: 'center' },
  linkText:      { color: '#2563eb', fontSize: 15 },

  // Account type cards
  typeCard:          { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, marginBottom: 12 },
  typeCardSelected:  { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  typeLabel:         { fontSize: 18, fontWeight: '600', color: '#1a1a1a' },
  typeLabelSelected: { color: '#2563eb' },
  typeDesc:          { fontSize: 14, color: '#666', marginTop: 4 },

  // Device ID
  deviceLabel:  { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 16, marginBottom: 6 },
  deviceIdBox:  { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 12, marginBottom: 6 },
  deviceIdText: { fontSize: 12, color: '#555', fontFamily: 'monospace' },
  deviceNote:   { fontSize: 12, color: '#888', marginBottom: 8 },

  // Toggles + days
  row:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  toggleBtn:    { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  toggleBtnOn:  { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  toggleText:   { color: '#1a1a1a', fontWeight: '500' },
  toggleTextOn: { color: '#fff' },
  dayBtn:       { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  dayBtnOn:     { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  dayText:      { fontSize: 12, color: '#1a1a1a' },
  dayTextOn:    { color: '#fff' },

  // Storefront photo picker
  photoPicker: {
    height:          180,
    borderRadius:    12,
    marginBottom:    16,
    overflow:        'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth:     1,
    borderColor:     '#e5e7eb',
    borderStyle:     'dashed',
  },
  photoPreview:         { width: '100%', height: '100%' },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent:  'flex-end',
    alignItems:      'center',
    paddingBottom:   12,
  },
  photoOverlayText:     { color: '#fff', fontSize: 14, fontWeight: '600' },
  photoPlaceholder:     { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  photoPlaceholderIcon: { fontSize: 36 },
  photoPlaceholderLabel:{ fontSize: 14, color: '#6b7280', fontWeight: '500', textAlign: 'center' },

  // Map
  mapLoading: {
    height:          220,
    backgroundColor: '#f3f4f6',
    borderRadius:    12,
    justifyContent:  'center',
    alignItems:      'center',
    gap:             8,
    marginBottom:    8,
  },
  mapLoadingText: { fontSize: 14, color: '#6b7280' },
  map: {
    height:        220,
    borderRadius:  12,
    marginBottom:   8,
    overflow:      'hidden',
  },
  coordsText: {
    fontSize:     13,
    color:        '#374151',
    fontWeight:   '500',
    textAlign:    'center',
    marginBottom: 4,
    fontFamily:   'monospace',
  },

  // Store type grid — 3 columns, 2 rows
  storeTypeGrid: {
    flexDirection:  'row',
    flexWrap:       'wrap',
    gap:             10,
    marginBottom:   16,
  },
  storeTypeBtn: {
    width:           '30%',        // ~3 per row with gap
    aspectRatio:      1,
    borderWidth:      1.5,
    borderColor:     '#e5e7eb',
    borderRadius:    12,
    backgroundColor: '#f9fafb',
    justifyContent:  'center',
    alignItems:      'center',
    gap:              4,
  },
  storeTypeBtnOn: {
    borderColor:     '#2563eb',
    backgroundColor: '#eff6ff',
  },
  storeTypeIcon:  { fontSize: 26 },
  storeTypeLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', textAlign: 'center' },
  storeTypeLabelOn: { color: '#2563eb' },
});
