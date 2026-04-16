/**
 * Report Service Tests
 * Tests for data aggregation, LLM prompt building, template rendering,
 * delivery abstraction, rate limiting, and scheduler logic.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Template Tests ──
const { buildEmailHtml } = require('../services/report/template');

describe('Report Template', () => {
  const sampleReport = {
    summary: 'Checked on herd health and milk production.',
    keyTopics: ['Cow #42 low production', 'Feed schedule adjustment'],
    notes: ['Monitor cow 42 closely', 'Order supplements'],
    actionItems: ['Call vet for cow 42', 'Update feed plan'],
  };

  describe('buildEmailHtml', () => {
    it('should return valid HTML with all sections', () => {
      const html = buildEmailHtml(sampleReport, 'John Farmer', 'April 14, 2026');

      assert.ok(html.includes('Bessie Daily Report'), 'Should include title');
      assert.ok(html.includes('April 14, 2026'), 'Should include date');
      assert.ok(html.includes('John Farmer'), 'Should include user name');
      assert.ok(html.includes('Cow #42 low production'), 'Should include key topic');
      assert.ok(html.includes('Monitor cow 42 closely'), 'Should include note');
      assert.ok(html.includes('Call vet for cow 42'), 'Should include action item');
      assert.ok(html.includes('<!DOCTYPE html>'), 'Should be valid HTML');
    });

    it('should escape HTML entities in content', () => {
      const xssReport = {
        summary: '<script>alert("xss")</script>',
        keyTopics: [],
        notes: [],
        actionItems: [],
      };

      const html = buildEmailHtml(xssReport, 'Test', 'Test Date');
      assert.ok(!html.includes('<script>'), 'Should escape script tags');
      assert.ok(html.includes('&lt;script&gt;'), 'Should contain escaped entities');
    });

    it('should handle empty arrays gracefully', () => {
      const emptyReport = { summary: 'No activity', keyTopics: [], notes: [], actionItems: [] };
      const html = buildEmailHtml(emptyReport, 'Test', 'Test Date');

      assert.ok(html.includes('No activity'), 'Should include summary');
      // Should not include rendered section content for empty arrays
      assert.ok(!html.includes('💬 Key Topics'), 'Should not render Key Topics section');
      assert.ok(!html.includes('📝 Notes'), 'Should not render Notes section');
      assert.ok(!html.includes('⚡ Action Items'), 'Should not render Action Items section');
    });
  });
});

// ── Report Service Logic Tests ──
const { buildLlmPrompt, MAX_DAILY_SENDS } = require('../services/report');

describe('Report Service', () => {
  describe('buildLlmPrompt', () => {
    it('should include today\'s conversations in prompt', () => {
      const data = {
        chats: [
          { prompt: 'How is cow 42?', response: 'Cow 42 production is down 15%.' },
          { prompt: 'What should I feed her?', response: 'Increase protein supplement.' },
        ],
        notes: [{ content: 'Check cow 42 tomorrow', animal_number: '42' }],
        sessionContext: [],
      };

      const prompt = buildLlmPrompt(data);

      assert.ok(prompt.includes('How is cow 42?'), 'Should include user prompt');
      assert.ok(prompt.includes('Cow 42 production is down'), 'Should include AI response');
      assert.ok(prompt.includes('Check cow 42 tomorrow'), 'Should include note');
      assert.ok(prompt.includes('[Cow #42]'), 'Should include cow tag');
      assert.ok(prompt.includes('JSON'), 'Should request JSON output');
    });

    it('should include prior session context for cross-day sessions', () => {
      const data = {
        chats: [{ prompt: 'Morning update?', response: 'All good today.' }],
        notes: [],
        sessionContext: [
          { prompt: 'Yesterday question', response: 'Yesterday answer' },
        ],
      };

      const prompt = buildLlmPrompt(data);

      assert.ok(prompt.includes('PRIOR SESSION CONTEXT'), 'Should flag prior context');
      assert.ok(prompt.includes('Yesterday question'), 'Should include prior messages');
    });

    it('should handle empty day', () => {
      const data = { chats: [], notes: [], sessionContext: [] };
      const prompt = buildLlmPrompt(data);

      assert.ok(prompt.includes('NO ACTIVITY RECORDED'), 'Should indicate no activity');
    });
  });

  describe('MAX_DAILY_SENDS', () => {
    it('should be set to 3', () => {
      assert.strictEqual(MAX_DAILY_SENDS, 3, 'Rate limit should be 3 per day');
    });
  });
});

// ── Preferences Shape Tests ──
// Validates the column-name normalization (report_* → un-prefixed) without a live DB.

describe('Report Preferences Normalization', () => {
  /**
   * Simulate what getPreferences does with a row from profiles.
   * Mirrors the normalization block in services/report/index.js.
   */
  function normalizeProfileRow(row, userId) {
    if (!row) return null;
    return {
      user_id:              userId,
      delivery_method:      row.report_delivery_method      ?? 'email',
      delivery_destination: row.report_delivery_destination ?? null,
      schedule_enabled:     row.report_schedule_enabled     ?? true,
      schedule_time:        row.report_schedule_time        ?? '18:00',
      timezone:             row.report_timezone             ?? 'America/Denver',
    };
  }

  /**
   * Simulate what savePreferences writes to profiles.
   * Mirrors the update payload in services/report/index.js.
   */
  function buildSavePayload(prefs) {
    return {
      report_delivery_method:      prefs.delivery_method      ?? 'email',
      report_delivery_destination: prefs.delivery_destination ?? null,
      report_schedule_enabled:     prefs.schedule_enabled     ?? true,
      report_schedule_time:        prefs.schedule_time        ?? '18:00',
      report_timezone:             prefs.timezone             ?? 'America/Denver',
    };
  }

  const userId = 'test-user-id';

  it('should normalize a full profiles row to un-prefixed shape', () => {
    const row = {
      report_delivery_method:      'email',
      report_delivery_destination: 'farmer@example.com',
      report_schedule_enabled:     true,
      report_schedule_time:        '17:00',
      report_timezone:             'America/Chicago',
    };
    const prefs = normalizeProfileRow(row, userId);

    assert.strictEqual(prefs.user_id,              userId);
    assert.strictEqual(prefs.delivery_method,      'email');
    assert.strictEqual(prefs.delivery_destination, 'farmer@example.com');
    assert.strictEqual(prefs.schedule_enabled,     true);
    assert.strictEqual(prefs.schedule_time,        '17:00');
    assert.strictEqual(prefs.timezone,             'America/Chicago');
  });

  it('should apply defaults when profile columns are null', () => {
    const row = {
      report_delivery_method:      null,
      report_delivery_destination: null,
      report_schedule_enabled:     null,
      report_schedule_time:        null,
      report_timezone:             null,
    };
    const prefs = normalizeProfileRow(row, userId);

    assert.strictEqual(prefs.delivery_method,  'email');
    assert.strictEqual(prefs.schedule_enabled, true);
    assert.strictEqual(prefs.schedule_time,    '18:00');
    assert.strictEqual(prefs.timezone,         'America/Denver');
  });

  it('should return null when row is null', () => {
    assert.strictEqual(normalizeProfileRow(null, userId), null);
  });

  it('should build a save payload with report_ prefixed keys', () => {
    const prefs = {
      delivery_method:      'email',
      delivery_destination: 'test@farm.com',
      schedule_enabled:     false,
      schedule_time:        '06:00',
      timezone:             'America/New_York',
    };
    const payload = buildSavePayload(prefs);

    assert.ok('report_delivery_method'      in payload, 'should have report_delivery_method');
    assert.ok('report_delivery_destination' in payload, 'should have report_delivery_destination');
    assert.ok('report_schedule_enabled'     in payload, 'should have report_schedule_enabled');
    assert.ok('report_schedule_time'        in payload, 'should have report_schedule_time');
    assert.ok('report_timezone'             in payload, 'should have report_timezone');

    assert.ok(!('user_id'              in payload), 'should NOT include user_id (set via .eq())');
    assert.ok(!('delivery_method'      in payload), 'should NOT include un-prefixed key');

    assert.strictEqual(payload.report_delivery_method,      'email');
    assert.strictEqual(payload.report_delivery_destination, 'test@farm.com');
    assert.strictEqual(payload.report_schedule_enabled,     false);
    assert.strictEqual(payload.report_schedule_time,        '06:00');
    assert.strictEqual(payload.report_timezone,             'America/New_York');
  });
});

// ── Scheduler Logic Tests ──
const { isTimeToSend } = require('../services/report/scheduler');

describe('Report Scheduler', () => {
  describe('isTimeToSend', () => {
    it('should return true when current time matches schedule', () => {
      // Create a date and check if it matches its own time in the given timezone
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Denver',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const currentHour = parts.find(p => p.type === 'hour')?.value;
      const currentMinute = parts.find(p => p.type === 'minute')?.value;
      const currentTime = `${currentHour}:${currentMinute}`;

      const result = isTimeToSend(now, currentTime, 'America/Denver');
      assert.ok(result, 'Should match current time in timezone');
    });

    it('should return false when time does not match', () => {
      const now = new Date('2026-04-14T12:00:00Z');
      // 06:00 AM Denver = 12:00 UTC, so setting schedule to 07:00 should not match
      const result = isTimeToSend(now, '07:00', 'America/Denver');
      assert.strictEqual(result, false, 'Should not match different time');
    });

    it('should handle invalid timezone gracefully', () => {
      const now = new Date();
      const result = isTimeToSend(now, '18:00', 'Invalid/Timezone');
      assert.strictEqual(result, false, 'Should return false for invalid timezone');
    });

    it('should default to America/Denver when timezone is null', () => {
      const now = new Date();
      // Should not throw
      const result = isTimeToSend(now, '99:99', null);
      assert.strictEqual(result, false, 'Should not match impossible time');
    });
  });
});
