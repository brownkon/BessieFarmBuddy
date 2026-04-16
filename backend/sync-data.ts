require('dotenv').config();
const dataProcessor = require('./services/data-prep/data-processor');

async function runSync() {
  console.log('--- Starting Data Synchronization ---');
  try {
    await dataProcessor.syncAll();
    console.log('--- Sync Finished ---');
  } catch (error) {
    console.error('--- Sync Failed ---');
    console.error(error);
  }
}

runSync();
