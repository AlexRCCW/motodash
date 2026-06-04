import * as Location from 'expo-location';

/**
 * Request location permissions.
 * Returns true if granted.
 */
export async function requestLocationPermission() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Get current position once.
 * Returns { lat, lng } or null.
 */
export async function getCurrentLocation() {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      lat: loc.coords.latitude,
      lng: loc.coords.longitude,
    };
  } catch (e) {
    console.error('Location error:', e);
    return null;
  }
}

/**
 * Haversine distance in meters between two lat/lng pairs.
 * Used on-device for geofence checks — no network call needed.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Watch position continuously.
 * Calls callback with { lat, lng } on each update.
 * Returns a cleanup function to stop watching.
 */
export async function watchLocation(callback) {
  const sub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 3000,   // every 3 seconds
      distanceInterval: 5,  // or every 5 meters
    },
    loc => {
      callback({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    }
  );
  return () => sub.remove();
}
