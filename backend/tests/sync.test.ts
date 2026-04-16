import 'dotenv/config';
import { dataProcessor } from '../services/data-prep';

async function runTest() {
  console.log('--- Starting Data Processor Test ---');
  try {
    const orgId = await dataProcessor.getDefaultOrganizationId();
    if (!orgId) {
      console.error('No organization found. Please make sure you have at least one organization in your Supabase database.');
      return;
    }
    console.log(`Found Organization ID: ${orgId}`);
    
    console.log('Syncing all CSV files...');
    await dataProcessor.syncAll();
    console.log('--- Test Complete ---');
  } catch (err: any) {
    console.error('Test failed:', err?.message || err);
  }
}

runTest();

