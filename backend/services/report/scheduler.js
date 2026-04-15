/**
 * Report Scheduler
 * Uses node-cron to check every minute for users whose scheduled
 * report time matches the current time (adjusted for timezone).
 */

const cron = require('node-cron');
const supabase = require('../supabase');
const { generateAndDeliver } = require('./index');

let cronJob = null;

/**
 * Start the report scheduler.
 * Runs every minute, checks for users whose schedule_time (in their timezone)
 * matches the current HH:MM.
 */
function startScheduler() {
  if (!supabase) {
    console.warn('[Report/Scheduler] Supabase not initialized — scheduler disabled.');
    return;
  }

  // Run every minute
  cronJob = cron.schedule('* * * * *', async () => {
    try {
      await processScheduledReports();
    } catch (err) {
      console.error('[Report/Scheduler] Unexpected error:', err.message);
    }
  });

  console.log('[Report/Scheduler] Daily report scheduler started.');
}

/**
 * Process all users whose report time matches now.
 */
async function processScheduledReports() {
  // Query profiles for users who have scheduling enabled
  const { data: rows, error } = await supabase
    .from('profiles')
    .select('id, report_delivery_method, report_delivery_destination, report_schedule_enabled, report_schedule_time, report_timezone')
    .eq('report_schedule_enabled', true)
    .neq('report_delivery_method', 'none');

  if (error) {
    console.error('[Report/Scheduler] Error fetching preferences:', error.message);
    return;
  }

  if (!rows || rows.length === 0) return;

  const now = new Date();

  for (const row of rows) {
    // Normalize to the un-prefixed shape expected by generateAndDeliver / isTimeToSend
    const pref = {
      user_id:              row.id,
      delivery_method:      row.report_delivery_method      ?? 'email',
      delivery_destination: row.report_delivery_destination ?? null,
      schedule_enabled:     row.report_schedule_enabled     ?? true,
      schedule_time:        row.report_schedule_time        ?? '18:00',
      timezone:             row.report_timezone             ?? 'America/Denver',
    };

    const shouldSend = isTimeToSend(now, pref.schedule_time, pref.timezone);

    if (shouldSend) {
      console.log(`[Report/Scheduler] Triggering report for user ${pref.user_id}`);
      try {
        const result = await generateAndDeliver(pref.user_id, pref);
        if (result.success) {
          console.log(`[Report/Scheduler] Report sent for user ${pref.user_id}`);
        } else {
          console.error(`[Report/Scheduler] Report failed for user ${pref.user_id}:`, result.error);
        }
      } catch (err) {
        console.error(`[Report/Scheduler] Error for user ${pref.user_id}:`, err.message);
      }
    }
  }
}

/**
 * Check if the current time matches the user's scheduled time.
 * Compares HH:MM in the user's timezone to their schedule_time.
 * @param {Date} now - Current UTC time.
 * @param {string} scheduleTime - Time string in HH:MM format.
 * @param {string} timezone - IANA timezone string.
 * @returns {boolean}
 */
function isTimeToSend(now, scheduleTime, timezone) {
  try {
    const tz = timezone || 'America/Denver';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const currentHour = parts.find(p => p.type === 'hour')?.value || '00';
    const currentMinute = parts.find(p => p.type === 'minute')?.value || '00';
    const currentTime = `${currentHour}:${currentMinute}`;

    // schedule_time is stored as "HH:MM" or "HH:MM:SS"
    const targetTime = scheduleTime?.substring(0, 5) || '18:00';

    return currentTime === targetTime;
  } catch (err) {
    console.error('[Report/Scheduler] Timezone error:', err.message);
    return false;
  }
}

/**
 * Stop the scheduler (for cleanup on server shutdown).
 */
function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[Report/Scheduler] Scheduler stopped.');
  }
}

module.exports = { startScheduler, stopScheduler, isTimeToSend, processScheduledReports };
