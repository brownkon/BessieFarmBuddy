const supabase = require('./services/supabase');

async function run() {
  const { data: users } = await supabase.from('profiles').select('*');
  console.log("Users:", users);

  const { data: orgs } = await supabase.from('organizations').select('*');
  console.log("Organizations:", orgs);
}

run();
