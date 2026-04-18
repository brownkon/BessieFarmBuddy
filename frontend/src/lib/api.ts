import { Platform } from 'react-native';
import { supabase } from './supabase';

const configuredBackendUrl = (process.env.EXPO_PUBLIC_BACKEND_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

function getBackendCandidates() {
  const configured = configuredBackendUrl;
  const candidates = [configured];

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const hostFromBrowser = window.location.hostname;
    candidates.push(`http://${hostFromBrowser}:3000`);
    candidates.push('http://localhost:3000');
    candidates.push('http://127.0.0.1:3000');
  }

  return Array.from(new Set(candidates.map((url) => url.replace(/\/+$/, ''))));
}

let cachedBackendUrl: string | null = null;

export async function getBackendUrl() {
  if (cachedBackendUrl) return cachedBackendUrl;

  const candidates = getBackendCandidates();

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/health`, { method: 'GET' });
      if (response.ok) {
        cachedBackendUrl = candidate;
        return candidate;
      }
    } catch {
      // Ignore
    }
  }

  cachedBackendUrl = configuredBackendUrl;
  return configuredBackendUrl;
}

export async function fetchAuthenticated(path: string, options: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = await getBackendUrl();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
    Authorization: `Bearer ${session.access_token}`,
  };

  const bodyCandidate = options.body as unknown;
  const isBodyObject = typeof bodyCandidate === 'object' && bodyCandidate !== null;
  const isFormData =
    isBodyObject &&
    (
      bodyCandidate instanceof FormData ||
      ('append' in bodyCandidate && typeof (bodyCandidate as { append?: unknown }).append === 'function') ||
      ('_parts' in bodyCandidate)
    );
    
  if (!isFormData && typeof options.body !== 'string') {
    headers['Content-Type'] = 'application/json';
  }

  console.log(`[API] Fetching ${path}`, { isFormData, bodyType: typeof options.body });

  const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
  
  const rawBody = await response.text();
  let json: any;
  if (rawBody) {
    try {
      json = JSON.parse(rawBody);
    } catch {
      json = { summary: rawBody };
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${json?.error || 'Request failed'}`);
  }

  return json;
}
