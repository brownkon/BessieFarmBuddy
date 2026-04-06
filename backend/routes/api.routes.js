const healthRoutes = require('./health.route');
const chatRoutes = require('./chat.route');
const voiceChatRoutes = require('./voice-chat.route');

async function apiRoutes(fastify, options) {
  // Register modular routes
  fastify.register(healthRoutes);
  fastify.register(chatRoutes);
  fastify.register(voiceChatRoutes);
}

module.exports = apiRoutes;
