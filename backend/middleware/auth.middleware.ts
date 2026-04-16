const supabase = require('../services/supabase');

async function authenticate(request, reply) {
  if (!supabase) {
    request.log.error('[Auth] Supabase client is not initialized. Check environment variables.');
    return reply.code(503).send({ error: 'Authentication service unavailable (unconfigured)' });
  }

  try {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      request.log.warn('[Auth] No authorization header found.');
      return reply.code(401).send({ error: 'Missing Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      request.log.warn('[Auth] No token found in bearer header.');
      return reply.code(401).send({ error: 'Missing Token' });
    }

    // DEBUG: Check for truncation
    request.log.info(`[Auth] Token received. Length: ${token.length}. Preview: ${token.substring(0, 10)}...${token.substring(token.length - 10)}`);

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      request.log.error(`[Auth] Supabase error: ${error.message}`);
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }

    if (!user) {
      request.log.warn('[Auth] No user found for this token.');
      return reply.code(401).send({ error: 'Invalid User' });
    }

    request.user = user;
    request.log.info(`[Auth] Authenticated ${user.email}`);
  } catch (error) {
    request.log.error(`[Auth] Critical check error: ${error.message}`);
    return reply.code(500).send({ error: 'Authentication failed' });
  }
}

module.exports = { authenticate };
