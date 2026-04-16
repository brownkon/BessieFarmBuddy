import { Platform } from 'react-native';
import { supabase } from './supabase';

export type StreamChunk = {
  content?: string;
  transcript?: string;
  toolCall?: string;
  terminate?: boolean;
  error?: string;
};

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

function parseStreamError(status: number, responseText: string) {
  if (!responseText) {
    return `HTTP ${status}: Request failed`;
  }

  try {
    const parsed = JSON.parse(responseText);
    return `HTTP ${status}: ${parsed?.error || 'Request failed'}`;
  } catch {
    return `HTTP ${status}: ${responseText}`;
  }
}

/**
 * Streams Server-Sent Events from authenticated backend routes.
 * Uses XHR so it works reliably in React Native where fetch streaming is inconsistent.
 */
export async function streamAuthenticatedSse(
  path: string,
  options: {
    method?: 'POST' | 'GET';
    body?: string | FormData;
    headers?: Record<string, string>;
  },
  onChunk: (chunk: StreamChunk) => void,
) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const baseUrl = await getBackendUrl();
  const method = options.method || 'POST';
  const body = options.body;
  const headers = options.headers || {};

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${baseUrl}${path}`);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');

    if (!isFormData && body !== undefined && !hasContentType) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }

    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    let seenBytes = 0;

    const processNewData = () => {
      const incoming = xhr.responseText.substring(seenBytes);
      seenBytes = xhr.responseText.length;
      const lines = incoming.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue;
        }

        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') {
          continue;
        }

        try {
          const parsed = JSON.parse(payload) as StreamChunk;
          onChunk(parsed);
        } catch {
          // Ignore malformed partial lines while the stream is in-flight.
        }
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        processNewData();
      }

      if (xhr.readyState !== 4 || settled) {
        return;
      }

      settled = true;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(parseStreamError(xhr.status, xhr.responseText)));
      }
    };

    xhr.onerror = () => {
      if (!settled) {
        settled = true;
        reject(new Error('Network error'));
      }
    };

    if (body !== undefined) {
      xhr.send(body as any);
    } else {
      xhr.send();
    }
  });
}
