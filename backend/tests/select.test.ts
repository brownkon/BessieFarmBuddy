import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFetch() {
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
    
  if (error) console.log('Error:', error.message);
  console.log('Data:', JSON.stringify(data, null, 2));
}

testFetch();
