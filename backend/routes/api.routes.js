const healthRoutes = require('./health.route');
const chatRoutes = require('./chat.route');
const voiceChatRoutes = require('./voice-chat.route');
const syncRoutes = require('./sync.route');

async function apiRoutes(fastify, options) {
  // Register modular routes
  fastify.register(healthRoutes);
  fastify.register(chatRoutes);
  fastify.register(voiceChatRoutes);
  fastify.register(syncRoutes);
}

module.exports = apiRoutes;
