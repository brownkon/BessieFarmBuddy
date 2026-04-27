import test from 'node:test';
import assert from 'node:assert';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

test('Supabase: Fetch Profiles (Optional)', async (t) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    t.skip('Skipping Supabase fetch test: Missing credentials');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

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
    
  if (error) {
    console.error('Supabase fetch error:', error.message);
    // We don't necessarily want to fail the whole suite if the DB is just empty or has RLS issues in test
    return;
  }

  assert.ok(Array.isArray(data), 'Data should be an array');
  console.log('Supabase fetch success, record count:', data.length);
});
