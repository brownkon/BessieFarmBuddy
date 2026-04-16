import { authenticate } from '../middleware/auth.middleware';
import supabase from '../services/supabase';
import crypto from 'crypto';

/**
 * Utility to generate a unique 6-character access code for an organization.
 */
function generateAccessCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // Generates EX: 'A1B2C3'
}

async function orgRoutes(fastify: any, options: any) {
  
  // Open endpoint to pre-validate access codes before user signs up
  fastify.get('/org/validate/:code', async (request: any, reply: any) => {
    try {
      const { code } = request.params;
      if (!code) return reply.code(400).send({ error: 'Code is required' });

      const normalizedCode = code.toUpperCase();

      // Find Organization with Access Code
      const { data: orgs, error } = await (supabase as any)
        .from('organizations')
        .select('id, name')
        .eq('access_code', normalizedCode);

      if (error || !orgs || orgs.length === 0) {
        return reply.code(404).send({ error: 'Invalid access code' });
      }

      return reply.send({ success: true, org_name: orgs[0].name });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/org/create', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const { name, location } = request.body;
      const user = request.user;
      
      if (!name) return reply.code(400).send({ error: 'Organization name is required' });

      // Generate unique access code
      const access_code = generateAccessCode();

      // 1. Create Organization
      const { data: orgData, error: orgError } = await (supabase as any)
        .from('organizations')
        .insert({ name, access_code, location })
        .select()
        .single();

      if (orgError) {
        fastify.log.error(`[Org] Error creating org: ${orgError.message}`);
        return reply.code(500).send({ error: 'Failed to create organization' });
      }

      // 2. Add User as Boss
      const { error: memberError } = await (supabase as any)
        .from('profiles')
        .update({
          organization_id: orgData.id,
          role: 'boss'
        })
        .eq('id', user.id);

      if (memberError) {
        fastify.log.error(`[Org] Error creating member: ${memberError.message}`);
        return reply.code(500).send({ error: 'Failed to add owner to organization' });
      }

      return reply.send({ success: true, organization: orgData });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/org/join', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const { access_code } = request.body;
      const user = request.user;

      if (!access_code) return reply.code(400).send({ error: 'Access code is required' });

      const normalizedCode = access_code.toUpperCase();

      // 1. Find Organization with Access Code
      const { data: orgs, error: fetchError } = await (supabase as any)
        .from('organizations')
        .select('*')
        .eq('access_code', normalizedCode);

      if (fetchError || !orgs || orgs.length === 0) {
        return reply.code(404).send({ error: 'Invalid access code or organization not found' });
      }

      const organization = orgs[0];

      // 2. Check if already a member
      const { data: existingProfile } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
        
      if (existingProfile && existingProfile.organization_id) {
        return reply.code(400).send({ error: 'You are already a member of an organization' });
      }

      // 3. Add User as Employee
      const { error: memberError } = await (supabase as any)
        .from('profiles')
        .update({
          organization_id: organization.id,
          role: 'employee'
        })
        .eq('id', user.id);

      if (memberError) {
        fastify.log.error(`[Org] Error joining org: ${memberError.message}`);
        return reply.code(500).send({ error: 'Failed to join organization' });
      }

      return reply.send({ success: true, organization });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  fastify.post('/org/rollback', { preHandler: [authenticate] }, async (request: any, reply: any) => {
    try {
      const user = request.user;
      
      // Delete user from auth.users (requires service role key)
      const { error } = await (supabase as any).auth.admin.deleteUser(user.id);
      
      if (error) {
        fastify.log.error(`[Org Rollback] Error deleting user ${user.id}: ${error.message}`);
        return reply.code(500).send({ error: 'Failed to rollback' });
      }

      fastify.log.info(`[Org Rollback] Successfully rolled back user ${user.id}`);
      return reply.send({ success: true });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Rollback a zombie user by ID (no auth token needed — used when email confirmation
  // prevents a session from being issued, leaving user with no way to self-delete)
  fastify.post('/org/rollback-by-id', async (request: any, reply: any) => {
    try {
      const { user_id } = request.body || {};

      if (!user_id) {
        return reply.code(400).send({ error: 'user_id is required' });
      }

      const { error } = await (supabase as any).auth.admin.deleteUser(user_id);

      if (error) {
        fastify.log.error(`[Org Rollback By ID] Error deleting user ${user_id}: ${error.message}`);
        return reply.code(500).send({ error: 'Failed to rollback' });
      }

      fastify.log.info(`[Org Rollback By ID] Successfully rolled back user ${user_id}`);
      return reply.send({ success: true });
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

}

export default orgRoutes;
