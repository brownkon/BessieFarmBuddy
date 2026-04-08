/**
 * Utility functions for cleaning and parsing raw data from cow reports.
 */

/**
 * Strips HTML tags from a string.
 */
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>?/gm, '').trim();
}

/**
 * Parses a multi-line HTML string into an array of cleaned components.
 * Example: "Milk Drop<br/>SCC Indication<br/>" -> ["Milk Drop", "SCC Indication"]
 */
function parseMultiline(html) {
  if (!html) return [];
  return html
    .split(/<br\/?>/i)
    .map(val => val.replace(/&nbsp;/g, ' ').replace(/\xa0/g, ' ').trim())
    .filter(val => val.length > 0);
}

/**
 * Parses the "Severeness" HTML column to extract percentage values.
 * Example: "<span style='width:92%' class='severnesslinebar'></span><br/>" -> [92]
 */
function parseSevereness(html) {
  if (!html) return [];
  const results = [];
  const regex = /width:(\d+)%/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    results.push(parseInt(match[1], 10));
  }
  return results;
}

/**
 * Cleans a numeric value (e.g., removing spaces, converting to float).
 */
function cleanNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = val.toString().replace(/[^\d.-]/g, '');
  return cleaned ? parseFloat(cleaned) : null;
}

/**
 * Maps sensor labels to their corresponding values and severeness levels.
 * @param {string} sensorHtml
 * @param {string} valueHtml
 * @param {string} severenessHtml
 * @returns {Object} { sensors: { Label: Value }, severeness: { Label: Level } }
 */
function mapSensorData(sensorHtml, valueHtml, severenessHtml) {
  const sensors = parseMultiline(sensorHtml);
  const values = parseMultiline(valueHtml);
  const severenessLevels = parseSevereness(severenessHtml);

  const sensorMap = {};
  const severenessMap = {};

  sensors.forEach((label, index) => {
    sensorMap[label] = values[index] || null;
    severenessMap[label] = severenessLevels[index] || null;
  });

  return {
    sensors: sensorMap,
    severeness: severenessMap
  };
}

module.exports = {
  stripHtml,
  parseMultiline,
  parseSevereness,
  cleanNumber,
  mapSensorData
};
