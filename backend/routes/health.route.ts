async function healthRoutes(fastify: any, options: any) {
  fastify.get('/health', async () => ({ status: 'ok' }));
}

export default healthRoutes;
