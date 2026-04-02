const fastify = require('fastify')({
  logger: true,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});

require('dotenv').config();

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

module.exports = fastify;
