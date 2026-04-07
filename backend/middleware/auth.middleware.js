const supabase = require('../services/supabase.service');

async function authenticate(request, reply) {
  if (!supabase) {
    request.log.error('[Auth] Supabase client is not initialized. Check environment variables.');
    return reply.code(503).send({ error: 'Authentication service unavailable (unconfigured)' });
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return reply.code(401).send({ error: 'Missing Token' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    request.user = user;
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Authentication failed' });
  }
}

module.exports = { authenticate };
