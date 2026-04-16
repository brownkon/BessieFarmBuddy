import { authenticate } from '../middleware/auth.middleware';
import supabase from '../services/supabase';

/**
 * Routes for managing chat sessions.
 */
async function sessionRoutes(fastify: any, options: any) {
  // Get all sessions for the user
  fastify.get('/chat-sessions', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      const { limit = 10, offset = 0 } = (request.query as any);

      const { data, error, count } = await (supabase as any)
        .from('chat_sessions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

      if (error) throw error;

      return { sessions: data, total: count };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch sessions' });
    }
  });

  // Get messages for a specific session
  fastify.get('/chat-sessions/:id/messages', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      const { id } = (request.params as any);

      // Verify ownership of the session
      const { data: session, error: sessionError } = await (supabase as any)
        .from('chat_sessions')
        .select('id')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (sessionError || !session) {
        return reply.code(403).send({ error: 'Access denied or session not found' });
      }

      const { data: messages, error } = await (supabase as any)
        .from('chats')
        .select('*')
        .eq('session_id', id)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      return { messages };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch messages' });
    }
  });

  // Rename a session
  fastify.patch('/chat-sessions/:id', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      const { id } = (request.params as any);
      const { title } = (request.body as any);

      if (!title) return reply.code(400).send({ error: 'Title is required' });

      const { error } = await (supabase as any)
        .from('chat_sessions')
        .update({ title })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to rename session' });
    }
  });

  // Delete a session
  fastify.delete('/chat-sessions/:id', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      const { id } = (request.params as any);

      const { error } = await (supabase as any)
        .from('chat_sessions')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to delete session' });
    }
  });

  // Create a new session
  fastify.post('/chat-sessions', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      const { title = 'New Chat' } = (request.body as any) || {};

      const { data, error } = await (supabase as any)
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: title
        })
        .select()
        .single();

      if (error) throw error;

      return { session: data };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to create session' });
    }
  });
}

export default sessionRoutes;
