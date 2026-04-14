const fastify = require('fastify')({
  logger: true,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});

require('dotenv').config();
const { dataProcessor } = require('./services/data-prep');

const env = process.env.ENVIRONMENT || 'development';
const provider = process.env.LLM_PROVIDER || 'openai';
console.log(`\n🚀 [Bessie Backend] Starting in ${env.toUpperCase()} mode`);
console.log(`🤖 [AI Provider] Using ${provider.toUpperCase()}\n`);

// Register plugins
fastify.register(require('@fastify/cors'), { origin: true });
fastify.register(require('@fastify/multipart'), {
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB (Whisper's limit)
});

// Logs for all incoming requests
fastify.addHook('onRequest', async (request, reply) => {
  fastify.log.info(`[Backend] Incoming: ${request.method} ${request.url} from ${request.ip}`);
});

// Root routes
fastify.get('/', async () => ({ status: 'Bessie Backend is running' }));
fastify.get('/health', async () => ({ status: 'ok' }));

// API routes
fastify.register(require('./routes/api.routes'), { prefix: '/api' });

// Automation: Hourly sync
const SYNC_INTERVAL = 60 * 60 * 1000; // 1 hour
const syncIntervalId = setInterval(() => {
  console.log('[Automation] Starting hourly data sync...');
  dataProcessor.syncAll().catch(err => {
    console.error('[Automation] Scheduled sync failed:', err.message);
  });
}, SYNC_INTERVAL);

// Handle cleanup
fastify.addHook('onClose', async (instance) => {
  clearInterval(syncIntervalId);
  instance.log.info('[Automation] Sync interval cleared.');
});



module.exports = fastify;
