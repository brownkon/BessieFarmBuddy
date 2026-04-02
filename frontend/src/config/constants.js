import { Platform } from 'react-native';

export const WAKE_PHRASES = ['hey dairy', 'hey dearie', 'hey deairy', 'hey bessie', 'hey bessy', 'hey dary', 'bessie'];
export const EXIT_PHRASES = ['thank you', 'stop', 'bye', 'goodbye', 'thanks', 'dismissed', 'stop dialogue', 'stop talking', 'cancel', 'finished', 'done'];

export const configuredBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://144.39.117.142:3000';

export const getBackendCandidates = () => [
  configuredBackendUrl,
  'http://localhost:3000',
];

export const LANGUAGES = [
  { label: '🇺🇸 English', code: 'en', voicePrefix: 'en' },
  { label: '🇲🇽 Spanish', code: 'es', voicePrefix: 'es' },
];

export const getAccentLabel = (lang) => {
  const mapping = {
    'en-US': '🇺🇸 US',
    'en-GB': '🇬🇧 UK',
    'en-AU': '🇦🇺 AU',
    'en-IN': '🇮🇳 IN',
    'en-IE': '🇮🇪 IE',
    'en-ZA': '🇿🇦 ZA',
    'en-CA': '🇨🇦 CA',
    'en-NZ': '🇳🇿 NZ',
    'en-SG': '🇸🇬 SG',
  };
  const code = lang.substring(0, 5);
  return mapping[code] || code;
};
