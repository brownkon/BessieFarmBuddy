const { authenticate } = require('../middleware/auth.middleware');
const supabase = require('../services/supabase');

async function sessionRoutes(fastify, options) {
  // Get all sessions for the user
  fastify.get('/chat-sessions', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      const { limit = 10, offset = 0 } = request.query;

      const { data, error, count } = await supabase
        .from('chat_sessions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      return { sessions: data, total: count };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sessions' });
    }
  });

  // Get messages for a specific session
  fastify.get('/chat-sessions/:id/messages', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      const { id } = request.params;

      // Verify ownership of the session
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (sessionError || !session) {
        return reply.code(403).send({ error: 'Access denied or session not found' });
      }

      const { data: messages, error } = await supabase
        .from('chats')
        .select('*')
        .eq('session_id', id)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return { messages };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  // Rename a session
  fastify.patch('/chat-sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      const { id } = request.params;
      const { title } = request.body;

      if (!title) return reply.code(400).send({ error: 'Title is required' });

      const { error } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to rename session' });
    }
  });

  // Delete a session
  fastify.delete('/chat-sessions/:id', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = request.user;
      const { id } = request.params;

      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete session' });
    }
  });
}

module.exports = sessionRoutes;
