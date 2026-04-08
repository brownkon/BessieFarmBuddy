const supabase = require('../services/supabase');

async function getUserOrganization(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .single();
  return data?.organization_id;
}

module.exports = { getUserOrganization };
