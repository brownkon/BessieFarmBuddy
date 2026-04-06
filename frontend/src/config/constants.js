import { Platform } from 'react-native';

export const WAKE_PHRASES = ['hey dairy', 'hey dearie', 'hey deairy', 'hey bessie', 'hey bessy'];
export const EXIT_PHRASES = ['thanks dairy', 'bye dairy', 'goodbye dairy', 'thanks bessie', 'bye bessie', 'goodbye bessie', 'stop talking', 'stop talking dairy', 'stop talking bessie', 'bye dearie', 'thanks dearie', 'bye deairy', 'thanks deairy'];

export const FILLER_WORDS = [
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'person', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'am', 'are', 'was', 'were', 'been', 'being', 'has', 'had', 'having', 'did', 'does', 'done', 'doing', 'should', 'shall', 'would', 'might', 'must', 'can', 'could', 'may', 'come', 'came', 'get', 'got', 'give', 'gave', 'find', 'found', 'think', 'thought', 'feel', 'felt', 'try', 'tried', 'seem', 'seemed', 'leave', 'left', 'call', 'called', 'cow', 'heifer', 'calf', 'bull', 'steer', 'dairy', 'milk', 'farm', 'farmer', 'tractor', 'diesel', 'fuel', 'oil', 'truck', 'trailer', 'hay', 'corn', 'grain', 'silage', 'feed', 'water', 'grass', 'pasture', 'field', 'barn', 'stall', 'gate', 'fence', 'post', 'wire', 'herd', 'stock', 'market', 'price', 'steer', 'calf', 'birth', 'vet', 'health', 'sick', 'lame', 'dry', 'wet', 'rain', 'mud', 'dust', 'snow', 'cold', 'hot', 'sun', 'wind', 'day', 'night', 'morning', 'noon', 'evening', 'work', 'done', 'start', 'stop', 'help', 'ready', 'okay', 'yes', 'no', 'maybe', 'always', 'never', 'sometimes', 'often', 'again', 'here', 'there', 'now', 'soon', 'later', 'very', 'really', 'much', 'more', 'less', 'enough', 'too', 'quite', 'just', 'only', 'about', 'around', 'away', 'back', 'down', 'far', 'near', 'off', 'on', 'out', 'over', 'up', 'left', 'right', 'straight', 'back', 'front', 'side', 'top', 'bottom', 'inside', 'outside', 'around', 'between', 'among', 'through', 'toward', 'under', 'upon', 'within', 'without', 'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'at', 'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'by', 'during', 'except', 'for', 'from', 'in', 'inside', 'into', 'like', 'near', 'of', 'off', 'on', 'onto', 'out', 'outside', 'over', 'past', 'since', 'through', 'throughout', 'till', 'to', 'toward', 'under', 'until', 'up', 'upon', 'with', 'within', 'without'
];

export const configuredBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
