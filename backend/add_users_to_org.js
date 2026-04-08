const supabase = require('./services/supabase');

async function addUsers() {
  const { data: users } = await supabase.from('profiles').select('*');
  const orgId = '9a6c1e4a-1a16-43a2-814d-e8bae61081de'; // 'test' organization

  const { data: members } = await supabase.from('organization_members').select('*');
  
  for (const user of users) {
    const isMember = members.some(m => m.user_id === user.id);
    if (!isMember) {
      console.log(`Adding ${user.email} (id: ${user.id}) to organization`);
      const { error } = await supabase.from('organization_members').insert({
        organization_id: orgId,
        user_id: user.id,
        role: 'employee' // or 'boss'
      });
      if (error) {
        console.error(`Failed to add ${user.email}:`, error);
      } else {
        console.log(`Successfully added ${user.email}`);
      }
    }
  }
}

addUsers();
