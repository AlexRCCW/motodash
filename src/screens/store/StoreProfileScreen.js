import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../config/supabase';
import { colors, SlashDivider, radius } from '../../theme';
import { t } from '../../i18n';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function StoreProfileScreen({ navigation }) {
  const { account } = useAuth();

  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [photoUri,      setPhotoUri]      = useState(null);
  const [photoBase64,   setPhotoBase64]   = useState(null);
  const [currentPhoto,  setCurrentPhoto]  = useState(null);
  const [openHour,      setOpenHour]      = useState('08:00');
  const [closeHour,     setCloseHour]     = useState('20:00');
  const [daysOpen,      setDaysOpen]      = useState([]);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data, error } = await supabase
      .from('store_profiles')
      .select('storefront_image_url, open_hour, close_hour, days_open')
      .eq('id', account.id)
      .single();

    if (!error && data) {
      setCurrentPhoto(data.storefront_image_url ?? null);
      setOpenHour(data.open_hour  ?? '08:00');
      setCloseHour(data.close_hour ?? '20:00');
      setDaysOpen(data.days_open  ?? []);
    }
    setLoading(false);
  }

  function toggleDay(day) {
    setDaysOpen(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function handleChangePhoto() {
    Alert.alert(
      t('storeItems.changePhoto'),
      '',
      [
        { text: t('storeItems.takePhoto'),   onPress: () => pickPhoto('camera') },
        { text: t('storeItems.choosePhoto'), onPress: () => pickPhoto('library') },
        { text: t('shared.cancel'), style: 'cancel' },
      ]
    );
  }

  async function pickPhoto(source) {
    let result;
    if (source === 'camera') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('shared.error'), 'Camera permission denied.'); return; }
      result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 1 });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert(t('shared.error'), 'Photo library permission denied.'); return; }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true, aspect: [1, 1], quality: 1,
      });
    }
    if (!result.canceled && result.assets?.length > 0) {
      const resized = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 800 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      setPhotoUri(resized.uri);
      setPhotoBase64(resized.base64);
    }
  }

  async function handleSave() {
    if (!openHour || !closeHour) {
      Alert.alert(t('shared.error'), 'Please enter open and close hours.');
      return;
    }
    if (daysOpen.length === 0) {
      Alert.alert(t('shared.error'), 'Please select at least one day open.');
      return;
    }

    setSaving(true);

    const updates = {
      open_hour:  openHour,
      close_hour: closeHour,
      days_open:  daysOpen,
    };

    // Upload new photo if one was selected
    if (photoBase64) {
      const filePath = `store-photos/${account.id}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('store-assets')
        .upload(filePath, decode(photoBase64), { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        Alert.alert(t('shared.error'), 'Failed to upload photo.');
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('store-assets')
        .getPublicUrl(filePath);

      updates.storefront_image_url = urlData.publicUrl;
    }

    const { error } = await supabase
      .from('store_profiles')
      .update(updates)
      .eq('id', account.id);

    setSaving(false);

    if (error) {
      Alert.alert(t('shared.error'), 'Failed to save profile.');
      return;
    }

    Alert.alert(t('shared.saved') ?? 'Saved', t('storeProfile.savedMsg') ?? 'Your profile has been updated.', [
      { text: t('shared.ok') ?? 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  if (loading) {
    return (
      <View style={s.root}>
        <SafeAreaView style={s.hero} edges={['top']}>
          <View style={s.heroHeader}>
            <Text style={s.heroTitle}>MOTODASH</Text>
          </View>
        </SafeAreaView>
        <SlashDivider />
        <View style={s.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </View>
    );
  }

  const displayPhoto = photoUri ?? currentPhoto;

  return (
    <View style={s.root}>
      <SafeAreaView style={s.hero} edges={['top']}>
        <View style={s.heroHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.heroBack}>
            <Text style={s.heroBackText}>{t('shared.back').toUpperCase()}</Text>
          </TouchableOpacity>
          <Text style={s.heroTitle}>{(t('storeProfile.title') ?? 'STORE PROFILE').toUpperCase()}</Text>
          <View style={{ width: 60 }} />
        </View>
      </SafeAreaView>

      <SlashDivider />

      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

          {/* ── Store photo ── */}
          <Text style={s.sectionLabel}>{(t('storeProfile.storePhoto') ?? 'STORE PHOTO').toUpperCase()}</Text>
          <TouchableOpacity style={s.photoWrap} onPress={handleChangePhoto} activeOpacity={0.8}>
            {displayPhoto ? (
              <Image source={{ uri: displayPhoto }} style={s.photo} resizeMode="cover" />
            ) : (
              <View style={s.photoPlaceholder}>
                <Text style={s.photoPlaceholderText}>
                  {(t('storeProfile.tapToAddPhoto') ?? 'TAP TO ADD PHOTO').toUpperCase()}
                </Text>
              </View>
            )}
            <View style={s.photoOverlay}>
              <Text style={s.photoOverlayText}>
                {(t('storeProfile.changePhoto') ?? 'CHANGE PHOTO').toUpperCase()}
              </Text>
            </View>
          </TouchableOpacity>

          {/* ── Hours ── */}
          <Text style={s.sectionLabel}>{(t('storeProfile.hours') ?? 'HOURS').toUpperCase()}</Text>
          <View style={s.hoursRow}>
            <View style={s.hourField}>
              <Text style={s.hourLabel}>{(t('register.openHour') ?? 'Open').toUpperCase()}</Text>
              <TextInput
                style={s.hourInput}
                value={openHour}
                onChangeText={setOpenHour}
                placeholder="08:00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <Text style={s.hourSep}>—</Text>
            <View style={s.hourField}>
              <Text style={s.hourLabel}>{(t('register.closeHour') ?? 'Close').toUpperCase()}</Text>
              <TextInput
                style={s.hourInput}
                value={closeHour}
                onChangeText={setCloseHour}
                placeholder="20:00"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          {/* ── Days open ── */}
          <Text style={[s.sectionLabel, { marginTop: 24 }]}>
            {(t('register.daysOpen') ?? 'DAYS OPEN').toUpperCase()}
          </Text>
          <View style={s.daysRow}>
            {DAYS.map(day => (
              <TouchableOpacity
                key={day}
                style={[s.dayBtn, daysOpen.includes(day) && s.dayBtnOn]}
                onPress={() => toggleDay(day)}
              >
                <Text style={[s.dayText, daysOpen.includes(day) && s.dayTextOn]}>
                  {(t('register.days.' + day) ?? day).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Save ── */}
          <TouchableOpacity
            style={[s.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.onDark} />
              : <Text style={s.saveBtnText}>{(t('shared.save') ?? 'SAVE').toUpperCase()}</Text>
            }
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// base64 string → Uint8Array for Supabase storage upload
function decode(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '', i = 0;
  base64 = base64.replace(/=+$/, '');
  while (i < base64.length) {
    const a = chars.indexOf(base64[i++]);
    const b = chars.indexOf(base64[i++]);
    const c = chars.indexOf(base64[i++]);
    const d = chars.indexOf(base64[i++]);
    result += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1) result += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== -1) result += String.fromCharCode(((c & 3) << 6) | d);
  }
  return Uint8Array.from(result, c => c.charCodeAt(0));
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: colors.background },
  flex:  { flex: 1 },
  center:{ flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll:{ flex: 1 },
  content: { padding: 20, paddingBottom: 48 },

  hero: { backgroundColor: colors.hero, paddingBottom: 14 },
  heroHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  heroTitle:    { fontSize: 18, fontWeight: '500', color: colors.onDark, letterSpacing: 2 },
  heroBack:     { width: 60 },
  heroBackText: { fontSize: 11, fontWeight: '500', color: colors.mutedOnDark, letterSpacing: 1.5 },

  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 10,
  },

  // Photo
  photoWrap: {
    width: '100%', aspectRatio: 1, borderRadius: radius.md,
    overflow: 'hidden', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border, marginBottom: 28,
  },
  photo:            { ...StyleSheet.absoluteFillObject },
  photoPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  photoPlaceholderText: {
    fontSize: 11, fontWeight: '500', color: colors.textSecondary, letterSpacing: 1.5,
  },
  photoOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 10, alignItems: 'center',
  },
  photoOverlayText: {
    fontSize: 11, fontWeight: '500', color: '#fff', letterSpacing: 1.5,
  },

  // Hours
  hoursRow:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hourField: { flex: 1 },
  hourLabel: {
    fontSize: 10, fontWeight: '500', color: colors.textSecondary,
    letterSpacing: 1.5, marginBottom: 6,
  },
  hourInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: 12, fontSize: 16, color: colors.textPrimary,
    backgroundColor: colors.surface, textAlign: 'center',
  },
  hourSep: { fontSize: 18, color: colors.textSecondary, marginTop: 20 },

  // Days
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 32 },
  dayBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
  },
  dayBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText:  { fontSize: 11, fontWeight: '500', color: colors.textSecondary, letterSpacing: 1 },
  dayTextOn:{ color: colors.onDark },

  // Save
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 16, alignItems: 'center',
  },
  saveBtnText: {
    color: colors.onDark, fontSize: 13, fontWeight: '500', letterSpacing: 2,
  },
});
