import AsyncStorage from '@react-native-async-storage/async-storage';

import { configuredBackendUrl, getBackendCandidates } from '../config/constants';

const ACTIVE_BACKEND_URL_KEY = 'bessie:active-backend-url:v1';
const EMULATOR_BACKEND_FALLBACK = 'http://10.0.2.2:3000';
const HEALTHCHECK_TIMEOUT_MS = 2500;

function normalizeBackendUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  return url.trim().replace(/\/+$/, '');
}

function dedupeUrls(candidates) {
  return Array.from(
    new Set(
      candidates
        .map((value) => normalizeBackendUrl(value))
        .filter(Boolean)
    )
  );
}

async function checkBackendHealth(baseUrl, timeoutMs = HEALTHCHECK_TIMEOUT_MS) {
  try {
    const timedResult = await Promise.race([
      fetch(`${baseUrl}/health`, { method: 'GET' }).then((response) => response.ok).catch(() => false),
      new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);

    return Boolean(timedResult);
  } catch {
    return false;
  }
}

export async function persistActiveBackendUrl(url) {
  const normalized = normalizeBackendUrl(url);
  if (!normalized) {
    return;
  }

  try {
    await AsyncStorage.setItem(ACTIVE_BACKEND_URL_KEY, normalized);
  } catch (error) {
    console.warn('[BackgroundBackendUrl] Failed to persist active backend URL', error);
  }
}

export async function getPersistedActiveBackendUrl() {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_BACKEND_URL_KEY);
    return normalizeBackendUrl(raw);
  } catch (error) {
    console.warn('[BackgroundBackendUrl] Failed to load persisted backend URL', error);
    return '';
  }
}

export async function resolveBackgroundBackendUrl() {
  const persistedUrl = await getPersistedActiveBackendUrl();

  const candidates = dedupeUrls([
    persistedUrl,
    process.env.EXPO_PUBLIC_BACKEND_URL,
    ...getBackendCandidates(),
    configuredBackendUrl,
    EMULATOR_BACKEND_FALLBACK,
  ]);

  for (const candidate of candidates) {
    const isReachable = await checkBackendHealth(candidate);
    if (isReachable) {
      if (candidate !== persistedUrl) {
        await persistActiveBackendUrl(candidate);
      }
      return candidate;
    }
  }

  const fallback = normalizeBackendUrl(
    persistedUrl || process.env.EXPO_PUBLIC_BACKEND_URL || configuredBackendUrl || EMULATOR_BACKEND_FALLBACK
  );

  return fallback;
}
