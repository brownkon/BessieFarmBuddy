const supabase = require('../services/supabase');

/**
 * Shared utility functions for tools.
 */

/**
 * Fetches the first organization the user belongs to.
 */
async function getUserOrganization(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('organization_users')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error) {
    console.error('[Utils] Error fetching user organization:', error.message);
    return null;
  }
  return data ? data.organization_id : null;
}

/**
 * Standardizes dates for TTS (e.g., "2024-04-08" -> "April 8").
 * Supports relative terms (Today, Yesterday, X days ago) for the last week.
 */
function formatDate(rawDate) {
  if (!rawDate || typeof rawDate !== 'string') return rawDate;
  
  // Basic ISO/YYYY-MM-DD check to avoid trying to format everything
  if (!/^\d{4}-\d{2}-\d{2}/.test(rawDate)) return rawDate;

  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return rawDate;

  const now = new Date();
  
  // Set times to midnight to calculate pure day difference
  const dateMidnight = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const diffMs = nowMidnight - dateMidnight;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 7) return `${diffDays} days ago`;

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  
  return `${month} ${day}`;
}

/**
 * Recursively scans an object or array and formats any date-like strings.
 */
function formatAllDates(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => formatAllDates(item));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = formatDate(value);
    } else if (value && typeof value === 'object') {
      result[key] = formatAllDates(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

module.exports = { 
  getUserOrganization, 
  formatDate,
  formatAllDates
};
