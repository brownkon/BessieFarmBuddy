async function healthRoutes(fastify, options) {
  fastify.get('/health', async () => ({ status: 'ok' }));
}

module.exports = healthRoutes;
