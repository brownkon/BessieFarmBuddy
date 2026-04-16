import supabase from '../supabase';
import { deliverReport } from './delivery';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import 'dotenv/config';

/**
 * Report Generation Service
 * Aggregates daily chat messages and farmer notes, then uses the LLM
 * to produce a structured summary with action items.
 */

export const MAX_DAILY_SENDS = 3;
const SESSION_CONTEXT_LOOKBACK = 5; // messages from prior days for cross-day sessions

/**
 * Get the start and end of "today" in the user's timezone.
 * @param {string} timezone - IANA timezone string (e.g. "America/Denver").
 * @returns {{ startOfDay: string, endOfDay: string }} ISO strings in UTC.
 */
export function getDayBoundaries(timezone: string) {
  const now = new Date();
  // Format the current date in the user's timezone to get YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const localDate = formatter.format(now); // e.g., "2026-04-14"

  // Create start/end boundaries by parsing in the user's timezone
  const startLocal = new Date(`${localDate}T00:00:00`);
  const endLocal = new Date(`${localDate}T23:59:59`);

  // Convert to UTC by computing the offset
  const utcOffset = getTimezoneOffsetMs(timezone);
  const startUTC = new Date(startLocal.getTime() + utcOffset);
  const endUTC = new Date(endLocal.getTime() + utcOffset);

  return {
    startOfDay: startUTC.toISOString(),
    endOfDay: endUTC.toISOString(),
  };
}

/**
 * Approximate UTC offset for a timezone using Intl.
 * @param {string} timezone
 * @returns {number} offset in milliseconds
 */
export function getTimezoneOffsetMs(timezone: string): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = now.toLocaleString('en-US', { timeZone: timezone });
  return new Date(utcStr).getTime() - new Date(localStr).getTime();
}

/**
 * Check how many reports the user has sent today (for rate limiting).
 * @param {string} userId
 * @param {string} timezone
 * @returns {Promise<number>}
 */
export async function getTodaySendCount(userId: string, timezone: string): Promise<number> {
  if (!supabase) return 0;

  const { startOfDay, endOfDay } = getDayBoundaries(timezone);

  const { data, error } = await (supabase as any)
    .from('report_send_log')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .gte('sent_at', startOfDay)
    .lte('sent_at', endOfDay);

  if (error) {
    console.error('[Report] Error checking send count:', error.message);
    return 0;
  }

  return data?.length || 0;
}

/**
 * Log a report send for rate limiting.
 * @param {string} userId
 * @param {string} method
 * @param {boolean} success
 */
export async function logReportSend(userId: string, method: string, success: boolean) {
  if (!supabase) return;

  const { error } = await (supabase as any)
    .from('report_send_log')
    .insert({ user_id: userId, delivery_method: method, success });

  if (error) {
    console.error('[Report] Error logging send:', error.message);
  }
}

/**
 * Aggregate today's chats and notes for a user.
 * For sessions that span multiple days, includes prior context.
 * @param {string} userId
 * @param {string} timezone
 * @returns {Promise<{ chats: any[], notes: any[], sessionContext: any[] }>}
 */
export async function aggregateDailyData(userId: string, timezone: string) {
  if (!supabase) return { chats: [], notes: [], sessionContext: [] };

  const { startOfDay, endOfDay } = getDayBoundaries(timezone);

  // 1. Get today's chat messages
  const { data: todayChats, error: chatErr } = await (supabase as any)
    .from('chats')
    .select('prompt, response, timestamp, session_id, tools_used')
    .eq('user_id', userId)
    .gte('timestamp', startOfDay)
    .lte('timestamp', endOfDay)
    .order('timestamp', { ascending: true });

  if (chatErr) {
    console.error('[Report] Error fetching chats:', chatErr.message);
  }

  const chats = todayChats || [];

  // 2. Find sessions that started before today (cross-day context)
  const sessionIds = [...new Set(chats.map((c: any) => c.session_id).filter(Boolean))];
  let sessionContext: any[] = [];

  if (sessionIds.length > 0) {
    // Check which sessions have messages from before today
    const { data: priorMessages, error: priorErr } = await (supabase as any)
      .from('chats')
      .select('prompt, response, timestamp, session_id')
      .in('session_id', sessionIds)
      .lt('timestamp', startOfDay)
      .order('timestamp', { ascending: false })
      .limit(SESSION_CONTEXT_LOOKBACK * sessionIds.length);

    if (!priorErr && priorMessages?.length) {
      sessionContext = priorMessages.reverse(); // chronological order
    }
  }

  // 3. Get today's farmer notes
  const { data: todayNotes, error: noteErr } = await (supabase as any)
    .from('farmer_notes')
    .select('content, animal_number, created_at')
    .eq('user_id', userId)
    .gte('created_at', startOfDay)
    .lte('created_at', endOfDay)
    .order('created_at', { ascending: true });

  if (noteErr) {
    console.error('[Report] Error fetching notes:', noteErr.message);
  }

  return {
    chats,
    notes: todayNotes || [],
    sessionContext,
  };
}

/**
 * Build the LLM prompt from aggregated data.
 * @param {object} dailyData - From aggregateDailyData.
 * @returns {string} The prompt text.
 */
export function buildLlmPrompt(dailyData: { chats: any[], notes: any[], sessionContext: any[] }) {
  const { chats, notes, sessionContext } = dailyData;

  let prompt = `You are a farm management assistant. Generate a concise daily report from today's activity.

RESPOND IN VALID JSON with this exact structure:
{
  "summary": "1-2 sentence overview of the day",
  "keyTopics": ["topic 1", "topic 2"],
  "notes": ["note 1", "note 2"],
  "actionItems": ["action 1", "action 2"]
}

Rules:
- Keep everything short and scannable
- Extract actionable tasks from conversations as "actionItems"
- List farmer notes verbatim under "notes"
- Identify key discussion themes for "keyTopics"
- If there's no data, return empty arrays and a summary saying "No activity recorded today"
`;

  if (sessionContext.length > 0) {
    prompt += '\n--- PRIOR SESSION CONTEXT (for continuity) ---\n';
    sessionContext.forEach(msg => {
      prompt += `Farmer: ${msg.prompt}\nBessie: ${msg.response}\n`;
    });
  }

  if (chats.length > 0) {
    prompt += "\n--- TODAY'S CONVERSATIONS ---\n";
    chats.forEach(chat => {
      prompt += `Farmer: ${chat.prompt}\nBessie: ${chat.response}\n`;
    });
  }

  if (notes.length > 0) {
    prompt += "\n--- TODAY'S NOTES ---\n";
    notes.forEach(note => {
      const cowTag = note.animal_number ? ` [Cow #${note.animal_number}]` : '';
      prompt += `• ${note.content}${cowTag}\n`;
    });
  }

  if (chats.length === 0 && notes.length === 0) {
    prompt += '\n--- NO ACTIVITY RECORDED TODAY ---\n';
  }

  return prompt;
}

/**
 * Call the LLM to generate a structured report.
 * Uses the same OpenAI/Groq client as the main chat system.
 * @param {string} prompt
 * @returns {Promise<object>} Parsed report data.
 */
export async function summarizeWithLlm(prompt: string): Promise<any> {
  const provider = process.env.LLM_PROVIDER || 'openai';
  let client: any, model: string;

  if (provider === 'groq') {
    client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    model = 'llama-3.1-8b-instant';
  } else {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    model = 'gpt-4o-mini';
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
    });

    const content = completion.choices?.[0]?.message?.content || '';

    // Parse JSON from the LLM response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback: return raw text as summary
    return {
      summary: content.trim(),
      keyTopics: [],
      notes: [],
      actionItems: [],
    };
  } catch (err: any) {
    console.error('[Report] LLM summarization error:', err.message);
    return {
      summary: 'Unable to generate AI summary for today.',
      keyTopics: [],
      notes: [],
      actionItems: [],
    };
  }
}

/**
 * Get report preferences for a user.
 * Reads from the merged report_* columns on the profiles table.
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function getPreferences(userId: string): Promise<any> {
  if (!supabase) return null;

  const { data, error } = await (supabase as any)
    .from('profiles')
    .select('report_delivery_method, report_delivery_destination, report_schedule_enabled, report_schedule_time, report_timezone')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[Report] Error fetching preferences:', error.message);
    return null;
  }

  if (!data) return null;

  // Normalize to the shape the rest of the codebase expects (un-prefixed)
  return {
    user_id: userId,
    delivery_method:      data.report_delivery_method      ?? 'email',
    delivery_destination: data.report_delivery_destination ?? null,
    schedule_enabled:     data.report_schedule_enabled     ?? true,
    schedule_time:        data.report_schedule_time        ?? '18:00',
    timezone:             data.report_timezone             ?? 'America/Denver',
  };
}

/**
 * Save or update report preferences for a user.
 * Writes to the merged report_* columns on the profiles table.
 * @param {string} userId
 * @param {object} prefs
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function savePreferences(userId: string, prefs: any) {
  if (!supabase) return { success: false, error: 'Database not available.' };

  const { error } = await (supabase as any)
    .from('profiles')
    .update({
      report_delivery_method:      prefs.delivery_method      ?? 'email',
      report_delivery_destination: prefs.delivery_destination ?? null,
      report_schedule_enabled:     prefs.schedule_enabled     ?? true,
      report_schedule_time:        prefs.schedule_time        ?? '18:00',
      report_timezone:             prefs.timezone             ?? 'America/Denver',
    })
    .eq('id', userId);

  if (error) {
    console.error('[Report] Error saving preferences:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Full report generation and delivery pipeline.
 * @param {string} userId
 * @param {object} [overridePrefs] - Optional overrides (for manual trigger).
 * @returns {Promise<{success: boolean, reportData?: object, error?: string}>}
 */
export async function generateAndDeliver(userId: string, overridePrefs: any = null) {
  // 1. Get preferences
  const prefs = overridePrefs || await getPreferences(userId);
  if (!prefs || prefs.delivery_method === 'none') {
    return { success: false, error: 'Reports are disabled or preferences not found.' };
  }

  const timezone = prefs.timezone || 'America/Denver';

  // 2. Aggregate data
  const dailyData = await aggregateDailyData(userId, timezone);

  // 3. Build prompt and get LLM summary
  const prompt = buildLlmPrompt(dailyData);
  const reportData = await summarizeWithLlm(prompt);

  // 4. Get user info for email template
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('email, display_name')
    .eq('id', userId)
    .single();

  const userName = profile?.display_name || profile?.email || 'Farmer';
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });

  // 5. Deliver
  const destination = prefs.delivery_destination;
  if (!destination) {
    return { success: false, error: 'No delivery destination configured.' };
  }

  const result = await deliverReport(prefs.delivery_method, destination, reportData, userName, dateStr);

  // 6. Log the send
  await logReportSend(userId, prefs.delivery_method, result.success);

  return {
    success: result.success,
    reportData,
    error: result.error,
  };
}

export default {
  generateAndDeliver,
  getPreferences,
  savePreferences,
  getTodaySendCount,
  aggregateDailyData,
  buildLlmPrompt,
  summarizeWithLlm,
  MAX_DAILY_SENDS,
};
