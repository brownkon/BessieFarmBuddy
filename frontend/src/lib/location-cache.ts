import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCATION_CACHE_KEY = 'dairyvoice:last-gps-payload:v1';

export type CachedGpsPayload = {
  latitude: number;
  longitude: number;
  captured_at: string;
};

function isValidPayload(payload: CachedGpsPayload): boolean {
  if (!Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    return false;
  }

  if (payload.latitude < -90 || payload.latitude > 90 || payload.longitude < -180 || payload.longitude > 180) {
    return false;
  }

  return !Number.isNaN(new Date(payload.captured_at).getTime());
}

export async function saveCachedGpsPayload(payload: CachedGpsPayload): Promise<void> {
  if (!isValidPayload(payload)) {
    return;
  }

  await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(payload));
}

export async function loadCachedGpsPayload(maxAgeMs = 24 * 60 * 60 * 1000): Promise<CachedGpsPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as CachedGpsPayload;
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
