const { dataProcessor } = require('../services/data-prep');
const { authenticate } = require('../middleware/auth.middleware');

async function syncRoutes(fastify, options) {
  /**
   * Manual sync endpoint for triggering data processing.
   * Note: This is protected to prevent unauthorized triggers.
   */
  fastify.post('/sync-data', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      fastify.log.info(`[Sync] Manual trigger from ${request.user?.email || 'unknown'}`);
      await dataProcessor.syncAll();
      return { status: 'success', message: 'Data sync triggered successfully.' };
    } catch (err) {
      fastify.log.error(`[Sync] Manual trigger failed: ${err.message}`);
      reply.status(500).send({ status: 'error', message: err.message });
    }
  });
}

module.exports = syncRoutes;
