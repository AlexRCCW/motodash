import { supabase } from '../config/supabase';
import { getDeviceId } from './deviceService';

/**
 * Check if a device ID is blocked before allowing registration.
 * Returns true if blocked.
 */
export async function isDeviceBlocked(deviceId) {
  const { data, error } = await supabase
    .from('blocked_devices')
    .select('id')
    .eq('device_id', deviceId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * Log in with email + password.
 * Returns { account, error }
 * account includes status so we can route to hold/blocked screens immediately.
 */
export async function login(email, password) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (authError) return { account: null, error: authError.message };

  // Pull account row for status + account_type
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', authData.user.id)
    .single();

  if (accountError) return { account: null, error: accountError.message };

  // Update FCM token on login (token stored separately via notificationService)
  // device_id check on login — if device changed, flag for review (future feature)

  return { account, error: null };
}

/**
 * Register a new account.
 * Steps:
 * 1. Get device ID
 * 2. Check blocked_devices
 * 3. Create Supabase auth user
 * 4. Insert into accounts + type-specific profile table
 *
 * @param {object} base - { name, phone, email, password, accountType, language }
 * @param {object} profile - type-specific fields
 */
export async function register(base, profile) {
  // Step 1: device ID
  const deviceId = await getDeviceId();

  // Step 2: blocked check
  const blocked = await isDeviceBlocked(deviceId);
  if (blocked) {
    return { error: 'This device has been blocked from creating accounts.' };
  }

  // Step 3: create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: base.email,
    password: base.password,
  });
  if (authError) return { error: authError.message };

  const userId = authData.user.id;

  // Step 4a: insert into accounts
  const { error: accountError } = await supabase.from('accounts').insert({
    id: userId,
    account_type: base.accountType,
    name: base.name,
    phone: base.phone,
    email: base.email,
    device_id: deviceId,
    preferred_language: base.language || 'en',
    status: 'active',
  });
  if (accountError) return { error: accountError.message };

  // Step 4b: insert type-specific profile
  const profileError = await insertProfile(userId, base.accountType, profile);
  if (profileError) return { error: profileError };

  return { userId, error: null };
}

async function insertProfile(userId, accountType, profile) {
  if (accountType === 'driver') {
    const { error } = await supabase.from('driver_profiles').insert({
      id: userId,
      motorcycle_type: profile.motorcycleType,
      cedula_number: profile.cedulaNumber,
      accepts_rides: profile.acceptsRides ?? true,
      accepts_deliveries: profile.acceptsDeliveries ?? true,
    });
    if (error) return error.message;

    // Create empty stats row
    const { error: statsError } = await supabase.from('driver_stats').insert({ id: userId });
    if (statsError) return statsError.message;

  } else if (accountType === 'client') {
    const { error } = await supabase.from('client_profiles').insert({ id: userId });
    if (error) return error.message;

  } else if (accountType === 'store') {
    const { error } = await supabase.from('store_profiles').insert({
      id:           userId,
      store_name:   profile.storeName,
      store_type:   profile.storeType,
      location_lat: profile.locationLat,
      location_lng: profile.locationLng,
      open_hour:    profile.openHour,
      close_hour:   profile.closeHour,
      days_open:    profile.daysOpen,
    });
    if (error) return error.message;
  }

  return null;
}

export async function logout() {
  await supabase.auth.signOut();
}
