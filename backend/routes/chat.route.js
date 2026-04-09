const openaiService = require('../services/openai');
const { authenticate } = require('../middleware/auth.middleware');
const supabase = require('../services/supabase');

async function chatRoutes(fastify, options) {
  // Unified Text Chat (Streaming) - Protected
  fastify.post('/chat', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      let { text, history, language, location, sessionId } = request.body;
      const user = request.user;

      if (!text) return reply.code(400).send({ error: 'Text input is required' });

      // If no sessionId, create a new session
      let isNewSession = false;
      if (!sessionId) {
        isNewSession = true;
        const { data: newSession, error: sessError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            title: text.substring(0, 40) + (text.length > 40 ? '...' : '')
          })
          .select()
          .single();

        if (sessError) {
          fastify.log.error(`[Supabase] Error creating session: ${sessError.message}`);
          return reply.code(500).send({ error: 'Failed to create chat session' });
        }
        sessionId = newSession.id;
      }

      fastify.log.info(`[Bessie] Streaming chat for ${user.email} session ${sessionId}: "${text}"`);
      const stream = await openaiService.getChatStream({ 
        text, 
        history, 
        language, 
        context: { userId: user.id } 
      });

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      // Send sessionId to frontend if it was newly created
      if (isNewSession) {
        reply.raw.write(`data: ${JSON.stringify({ sessionId })}\n\n`);
      }

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
      setImmediate(() => {
        // Save message
        supabase.from('chats').insert({
          session_id: sessionId,
          user_id: user.id,
          prompt: text,
          response: fullResponse,
          gps_coordinates: location || null,
          tools_used: toolsUsed
        }).then(({ error }) => {
          if (error) fastify.log.error(`[Supabase] Error saving chat: ${error.message}`);
          else fastify.log.info(`[Supabase] Saved chat for ${user.email}`);
        });

        // Update session timestamp
        supabase.from('chat_sessions')
          .update({ updated_at: new Date() })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (error) fastify.log.error(`[Supabase] Error updating session timestamp: ${error.message}`);
          });
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
