const openaiService = require('../services/openai');
const { authenticate } = require('../middleware/auth.middleware');
const supabase = require('../services/supabase');

async function chatRoutes(fastify, options) {
  // Unified Text Chat (Streaming) - Protected
  fastify.post('/chat', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      let { text, history, language, location, sessionId } = request.body;
      const user = request.user;

      if (!text) {
        fastify.log.warn({ sessionId }, 'Chat request rejected: missing text');
        return reply.code(400).send({ error: 'Text input is required' });
      }

      // Smart Session Recovery: If sessionId is null/missing, find last or create new
      if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
        fastify.log.info({ userId: user.id }, 'Session ID missing, attempting recovery...');
        
        // 1. Try to find the most recent session
        const { data: latestSession } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (latestSession) {
          sessionId = latestSession.id;
          fastify.log.info({ sessionId }, 'Recovered existing session');
        } else {
          // 2. Create a new one if none found
          const { data: newSession, error: createError } = await supabase
            .from('chat_sessions')
            .insert({ user_id: user.id, title: 'New Chat' })
            .select()
            .single();
          
          if (createError) {
            fastify.log.error({ error: createError.message }, 'Failed to auto-create session');
            return reply.code(500).send({ error: 'Could not create or find a chat session' });
          }
          sessionId = newSession.id;
          fastify.log.info({ sessionId }, 'Auto-created new session');
        }
      }

      // Auto-title the session on its first real message
      const { data: currentSession } = await supabase
        .from('chat_sessions')
        .select('title')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (currentSession && (currentSession.title === 'New Chat' || !currentSession.title)) {
        await supabase
          .from('chat_sessions')
          .update({ title: text.substring(0, 40) + (text.length > 40 ? '...' : '') })
          .eq('id', sessionId);
      }

      fastify.log.info({ sessionId, email: user.email }, 'Streaming text chat');
      const stream = await openaiService.getChatStream({ 
        text, 
        history, 
        language, 
        context: { userId: user.id } 
      });

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');

      let fullResponse = "";
      const toolsUsed = [];

      for await (const chunk of stream) {
        if (chunk.content) fullResponse += chunk.content;
        if (chunk.terminate) toolsUsed.push('terminate_conversation');
        if (chunk.toolCall && !toolsUsed.includes(chunk.toolCall)) toolsUsed.push(chunk.toolCall);
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      // Async Log to Supabase (Background)
      setImmediate(() => {
        supabase.from('chats').insert({
          session_id: sessionId,
          user_id: user.id,
          prompt: text,
          response: fullResponse,
          gps_coordinates: location || null,
          tools_used: toolsUsed
        }).then(({ error }) => {
          if (error) fastify.log.error({ error: error.message }, 'Error saving chat');
          else fastify.log.info({ email: user.email }, 'Saved chat');
        });

        supabase.from('chat_sessions')
          .update({ updated_at: new Date() })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (error) fastify.log.error({ error: error.message }, 'Error updating session timestamp');
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
