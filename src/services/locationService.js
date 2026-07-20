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

// Converts a 24-hour "HH:MM" string (as stored in DB) to a 12-hour display string.
// e.g. "20:00" → "8:00 PM",  "08:30" → "8:30 AM"
export function formatHour(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Converts a 12-hour display string back to "HH:MM" for DB storage.
// Accepts "8:00 PM", "08:00 pm", "8 PM", or falls back to passthrough for "20:00".
export function to24h(display) {
  if (!display) return '';
  const cleaned = display.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (match) {
    let h = parseInt(match[1], 10);
    const m = match[2] ? parseInt(match[2], 10) : 0;
    if (match[3] === 'PM' && h !== 12) h += 12;
    if (match[3] === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  // Already in 24h format or unrecognised — return as-is
  return display.slice(0, 5);
}

// Formats a kilometre value for display.
// Under 1 km: shows metres rounded to nearest 5 m ("150 m").
// 1 km and above: shows one decimal place ("1.2 km").
export function formatDistance(km) {
  if (km == null || isNaN(km)) return '—';
  if (km < 1) {
    const metres = Math.round((km * 1000) / 5) * 5 || 5;
    return `${metres} m`;
  }
  return `${km.toFixed(1)} km`;
}

