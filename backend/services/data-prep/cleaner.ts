/**
 * Helper functions to clean and normalize data from diverse cow reports.
 */

export function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').trim();
}

export function parseMultiline(html: string): string[] {
  if (!html) return [];
  return html
    .split(/<br\/?>/i)
    .map(val => val.replace(/&nbsp;/g, ' ').replace(/\xa0/g, ' ').trim())
    .filter(val => val.length > 0);
}

/**
 * Extracts severeness percentage from HTML (e.g. style="width: 87%")
 */
export function parseSevereness(html: string): number[] {
  if (!html) return [];
  const results: number[] = [];
  const regex = /width\s*:\s*(\d+)%?/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(parseInt(match[1], 10));
  }
  return results;
}

/**
 * Extracts nCurrent/1080 from optimum insemination moment HTML
 */
export function extractOptimumMoment(html: string): number | null {
  if (!html) return null;
  const match = html.match(/nCurrent\s*=\s*['"](\d+)['"]/i);
  if (match) {
    return parseFloat(match[1]) / 1080;
  }
  return null;
}

/**
 * Converts Roman numerals I-V to integers 1-5
 */
export function parseRomanToNumber(val: string): number | null {
  if (!val) return null;
  const map: Record<string, number> = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5
  };
  return map[val.toUpperCase().trim()] || null;
}

export function cleanNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  // Handle commas as decimal points if necessary, but here we assume standard dots
  const cleaned = val.toString().replace(/[^\d.-]/g, '');
  return cleaned ? parseFloat(cleaned) : null;
}

export function parseBoolean(val: any): boolean {
  if (!val) return false;
  const s = val.toString().toLowerCase().trim();
  return s === 'x' || s === 'true' || s === '1' || s === 'yes';
}

/**
 * Map complex sensor data from Health Report
 */
export function mapSensorData(sensorHtml: string, valueHtml: string, severenessHtml: string) {
  const sensors = parseMultiline(sensorHtml);
  const values = parseMultiline(valueHtml);
  const severenessLevels = parseSevereness(severenessHtml);

  const sensorMap: Record<string, string | null> = {};
  const severenessMap: Record<string, number | null> = {};

  sensors.forEach((label, index) => {
    sensorMap[label] = values[index] || null;
    severenessMap[label] = severenessLevels[index] || null;
  });

  return {
    sensors: sensorMap,
    severeness: severenessMap
  };
}

export function formatDate(rawDate: any): string {
  if (!rawDate) return rawDate;
  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return rawDate;

  const now = new Date();

  const dateMidnight = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const diffMs = (nowMidnight as any) - (dateMidnight as any);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

export default {
  stripHtml,
  parseMultiline,
  parseSevereness,
  extractOptimumMoment,
  parseRomanToNumber,
  cleanNumber,
  parseBoolean,
  mapSensorData,
  formatDate
};
