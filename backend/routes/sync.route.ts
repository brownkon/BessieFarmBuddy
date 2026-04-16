import { dataProcessor } from '../services/data-prep';
import { authenticate } from '../middleware/auth.middleware';

async function syncRoutes(fastify: any, options: any) {
  /**
   * Manual sync endpoint for triggering data processing.
   * Note: This is protected to prevent unauthorized triggers.
   */
  fastify.post('/sync-data', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      fastify.log.info(`[Sync] Manual trigger from ${request.user?.email || 'unknown'}`);
      await dataProcessor.syncAll();
      return { status: 'success', message: 'Data sync triggered successfully.' };
    } catch (err: any) {
      fastify.log.error(`[Sync] Manual trigger failed: ${err.message}`);
      reply.status(500).send({ status: 'error', message: err.message });
    }
  });
}

export default syncRoutes;
