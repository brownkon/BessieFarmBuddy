const supabase = require('./backend/services/supabase');

async function test() {
  const { data, error } = await supabase
    .from('cow_data')
    .select('*')
    .eq('animal_number', '402')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Cow 402 Data:', JSON.stringify(data, null, 2));
}

test();
