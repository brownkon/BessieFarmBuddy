const openaiService = require('../services/openai');
const { authenticate } = require('../middleware/auth.middleware');
const supabase = require('../services/supabase');

async function chatRoutes(fastify, options) {
  // Unified Text Chat (Streaming) - Protected
  fastify.post('/chat', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const { text, history, language, location } = request.body;
      const user = request.user;

      if (!text) return reply.code(400).send({ error: 'Text input is required' });

      fastify.log.info(`[Bessie] Streaming chat for ${user.email} in ${language || 'en'}: "${text}"`);
      const stream = await openaiService.getChatStream({ text, history, language });

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      let fullResponse = "";
      const toolsUsed = [];

      for await (const chunk of stream) {
        if (chunk.content) fullResponse += chunk.content;
        if (chunk.terminate) toolsUsed.push('terminate_conversation');

        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      // Async Log to Supabase (Background)
      supabase.from('chats').insert({
        user_id: user.id,
        prompt: text,
        response: fullResponse,
        gps_coordinates: location || null,
        tools_used: toolsUsed
      }).then(({ error }) => {
        if (error) fastify.log.error(`[Supabase] Error saving chat: ${error.message}`);
        else fastify.log.info(`[Supabase] Saved chat for ${user.email}`);
      });

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
