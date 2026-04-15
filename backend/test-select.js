require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function test() {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      role,
      organizations (
        name,
        access_code
      )
    `)
    .limit(1);
    
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}

test();
