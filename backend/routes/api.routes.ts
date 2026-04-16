const healthRoutes = require('./health.route');
const chatRoutes = require('./chat.route');
const voiceChatRoutes = require('./voice-chat.route');
const sessionRoutes = require('./sessions.route');
const syncRoutes = require('./sync.route');
const orgRoutes = require('./org.route');

async function apiRoutes(fastify, options) {
  // Register modular routes
  fastify.register(healthRoutes);
  fastify.register(chatRoutes);
  fastify.register(voiceChatRoutes);
  fastify.register(sessionRoutes);
  fastify.register(syncRoutes);
  fastify.register(orgRoutes);
}

module.exports = apiRoutes;

