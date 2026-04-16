import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_CACHE_KEY = 'bessie:last-gps-payload:v1';

function isValidPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    return false;
  }

  if (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
    return false;
  }

  return !Number.isNaN(new Date(payload.captured_at).getTime());
}

export async function saveCachedGpsPayload(payload) {
  if (!isValidPayload(payload)) {
    return;
  }

  await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(payload));
}

export async function loadCachedGpsPayload(maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isValidPayload(parsed)) {
      return null;
    }

    const capturedAtMs = new Date(parsed.captured_at).getTime();
    const ageMs = Date.now() - capturedAtMs;
    if (ageMs > maxAgeMs) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
