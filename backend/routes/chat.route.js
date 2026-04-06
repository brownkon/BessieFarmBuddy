const openaiService = require('../services/openai.service');

async function chatRoutes(fastify, options) {
  // Unified Text Chat (Streaming)
  fastify.post('/chat', async (request, reply) => {
    try {
      const { text, history, language } = request.body;
      if (!text) return reply.code(400).send({ error: 'Text input is required' });

      fastify.log.info(`[Bessie] Streaming chat in ${language || 'en'} for: "${text}"`);
      const stream = await openaiService.getChatStream({ text, history, language });

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (error) {
      fastify.log.error(error);
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify({ error: 'Internal Server Error' })}\n\n`);
        reply.raw.end();
      }
    }
  });
}

module.exports = chatRoutes;
