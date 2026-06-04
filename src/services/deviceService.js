import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Returns a stable unique device ID.
 * Android: uses Application.getAndroidId()
 * iOS: uses Application.getIosIdForVendorAsync()
 * Simulator fallback: returns a fixed dev ID
 */
export async function getDeviceId() {
  if (!Device.isDevice) {
    return 'DEV_SIMULATOR_ID';
  }
  if (Platform.OS === 'android') {
    return Application.getAndroidId();
  }
  if (Platform.OS === 'ios') {
    return await Application.getIosIdForVendorAsync();
  }
  return 'UNKNOWN_DEVICE';
}
