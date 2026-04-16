import healthRoutes from './health.route';
import chatRoutes from './chat.route';
import voiceChatRoutes from './voice-chat.route';
import sessionRoutes from './sessions.route';
import syncRoutes from './sync.route';
import orgRoutes from './org.route';

async function apiRoutes(fastify: any, options: any) {
  // Register modular routes
  fastify.register(healthRoutes);
  fastify.register(chatRoutes);
  fastify.register(voiceChatRoutes);
  fastify.register(sessionRoutes);
  fastify.register(syncRoutes);
  fastify.register(orgRoutes);
}

export default apiRoutes;
