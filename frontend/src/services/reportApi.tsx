/**
 * Report API Service
 * Frontend API client for report preferences and triggering.
 */

/**
 * Fetch the user's report preferences.
 * @param {string} token - Auth token.
 * @param {string} backendUrl - Backend base URL.
 * @returns {Promise<object>} Preferences object.
 */
export async function getReportPreferences(token, backendUrl) {
  const response = await fetch(`${backendUrl}/api/report/preferences`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[ReportAPI] GET preferences failed:', response.status, JSON.stringify(data));
    throw new Error(data.error || 'Failed to fetch preferences');
  }
  return data.preferences;
}

/**
 * Save/update report preferences.
 * @param {string} token - Auth token.
 * @param {string} backendUrl - Backend base URL.
 * @param {object} prefs - Preferences to save.
 * @returns {Promise<{success: boolean}>}
 */
export async function saveReportPreferences(token, backendUrl, prefs) {
  console.log('[ReportAPI] Saving prefs:', JSON.stringify(prefs));
  const response = await fetch(`${backendUrl}/api/report/preferences`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prefs),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('[ReportAPI] PUT preferences failed:', response.status, JSON.stringify(data));
    throw new Error(data.error || 'Failed to save preferences');
  }
  return data;
}

/**
 * Manually trigger a report.
 * @param {string} token - Auth token.
 * @param {string} backendUrl - Backend base URL.
 * @returns {Promise<object>} Result with success status and remaining sends.
 */
export async function triggerReport(token, backendUrl) {
  console.log('[ReportAPI] Triggering report...');
  const response = await fetch(`${backendUrl}/api/report/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const data = await response.json();
  console.log('[ReportAPI] Generate response:', response.status, JSON.stringify(data));

  if (response.status === 429) {
    return { rateLimited: true, error: data.error, sends_today: data.sends_today, max_sends: data.max_sends };
  }

  if (!response.ok) {
    console.error('[ReportAPI] Generate failed:', response.status, JSON.stringify(data));
    throw new Error(data.error || 'Failed to generate report');
  }
  return data;
}
