/**
 * Report API Routes
 * Manages report preferences and manual report triggering.
 * Registered at prefix /api/report in app.js
 */

const { authenticate } = require('../middleware/auth.middleware');
const reportService = require('../services/report');

async function reportRoutes(fastify, options) {

  // GET /api/report/preferences — Get user's report preferences
  fastify.get('/preferences', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      fastify.log.info({ userId: user.id }, '[Report] Fetching preferences');

      const prefs = await reportService.getPreferences(user.id);

      // If no prefs exist yet, return defaults with the user's email
      if (!prefs) {
        fastify.log.info({ userId: user.id }, '[Report] No prefs found, returning defaults');
        return {
          preferences: {
            delivery_method: 'email',
            delivery_destination: user.email,
            schedule_enabled: true,
            schedule_time: '18:00',
            timezone: 'America/Denver',
          }
        };
      }

      return { preferences: prefs };
    } catch (error) {
      fastify.log.error({ err: error.message, stack: error.stack }, '[Report] GET preferences failed');
      return reply.code(500).send({ error: 'Failed to fetch report preferences' });
    }
  });

  // PUT /api/report/preferences — Save/update report preferences
  fastify.put('/preferences', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      const body = request.body || {};
      fastify.log.info({ userId: user.id, body }, '[Report] Saving preferences');

      const { delivery_method, delivery_destination, schedule_enabled, schedule_time, timezone } = body;

      // Validate delivery method (Email only for now)
      if (delivery_method && !['email', 'none'].includes(delivery_method)) {
        fastify.log.warn({ delivery_method }, '[Report] Invalid delivery method');
        return reply.code(400).send({ error: 'Invalid delivery method. Must be email or none.' });
      }

      // Validate schedule_time format (HH:MM)
      if (schedule_time && !/^\d{2}:\d{2}$/.test(schedule_time)) {
        fastify.log.warn({ schedule_time }, '[Report] Invalid schedule_time format');
        return reply.code(400).send({ error: 'Invalid schedule_time format. Use HH:MM.' });
      }

      const result = await reportService.savePreferences(user.id, {
        delivery_method,
        delivery_destination,
        schedule_enabled,
        schedule_time,
        timezone,
      });

      if (!result.success) {
        fastify.log.error({ err: result.error, userId: user.id }, '[Report] savePreferences failed');
        return reply.code(500).send({ error: result.error });
      }

      fastify.log.info({ userId: user.id }, '[Report] Preferences saved successfully');
      return { success: true };
    } catch (error) {
      fastify.log.error({ err: error.message, stack: error.stack }, '[Report] PUT preferences failed');
      return reply.code(500).send({ error: 'Failed to save report preferences' });
    }
  });

  // POST /api/report/generate — Manually trigger a report
  fastify.post('/generate', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      fastify.log.info({ userId: user.id }, '[Report] Manual generate triggered');

      // Get preferences to determine timezone for rate limiting
      const prefs = await reportService.getPreferences(user.id);
      fastify.log.info({ prefs, userId: user.id }, '[Report] Loaded prefs for generate');

      const timezone = prefs?.timezone || 'America/Denver';

      // Rate limit check
      const sendCount = await reportService.getTodaySendCount(user.id, timezone);
      if (sendCount >= reportService.MAX_DAILY_SENDS) {
        return reply.code(429).send({
          error: `You've reached your daily report limit (${reportService.MAX_DAILY_SENDS} per day). Try again tomorrow.`,
          sends_today: sendCount,
          max_sends: reportService.MAX_DAILY_SENDS,
        });
      }

      if (!prefs || prefs.delivery_method === 'none') {
        fastify.log.warn({ prefs, userId: user.id }, '[Report] No valid prefs for generate');
        return reply.code(400).send({
          error: 'Please configure your report preferences first.',
        });
      }

      if (!prefs.delivery_destination) {
        fastify.log.warn({ userId: user.id }, '[Report] No delivery destination');
        return reply.code(400).send({
          error: 'No delivery email configured. Please set an email address.',
        });
      }

      const result = await reportService.generateAndDeliver(user.id, prefs);
      fastify.log.info({ result, userId: user.id }, '[Report] generateAndDeliver result');

      if (!result.success) {
        fastify.log.error({ err: result.error, userId: user.id }, '[Report] Delivery failed');
        return reply.code(500).send({ error: result.error });
      }

      return {
        success: true,
        message: `Report sent via ${prefs.delivery_method} to ${prefs.delivery_destination}`,
        sends_today: sendCount + 1,
        max_sends: reportService.MAX_DAILY_SENDS,
      };
    } catch (error) {
      fastify.log.error({ err: error.message, stack: error.stack }, '[Report] POST generate failed');
      return reply.code(500).send({ error: 'Failed to generate report' });
    }
  });
}

module.exports = reportRoutes;
