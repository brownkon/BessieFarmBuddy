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

export function parseSevereness(html: string): number[] {
  if (!html) return [];
  const results: number[] = [];
  const regex = /width:(\d+)%?/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(parseInt(match[1], 10));
  }
  return results;
}

export function cleanNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = val.toString().replace(/[^\d.-]/g, '');
  return cleaned ? parseFloat(cleaned) : null;
}

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
  cleanNumber,
  mapSensorData,
  formatDate
};

