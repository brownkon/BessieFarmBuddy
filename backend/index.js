const fastify = require('./app');

const start = async (retries = 2) => {
  try {
    const port = process.env.PORT || 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`server listening on ${fastify.server.address().port}`);
  } catch (err) {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      fastify.log.warn(`Port 3000 in use, retrying in 1s... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return start(retries - 1);
    }
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`[Server] ${signal} received. Closing...`);
    try {
      await fastify.close();
      fastify.log.info('[Server] Closed successfully.');
      process.exit(0);
    } catch (err) {
      fastify.log.error(`[Server] Error during shutdown: ${err.message}`);
      process.exit(1);
    }
  });
});

module.exports = fastify;