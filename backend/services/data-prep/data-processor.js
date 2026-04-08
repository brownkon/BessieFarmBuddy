const fs = require('fs-extra');
const path = require('path');
const { parse } = require('csv-parse/sync');
const supabase = require('../supabase');
const { cleanNumber, mapSensorData } = require('./cleaner.js');

const DATA_DIR = path.join(__dirname, '../../../data/CSV');

/**
 * Main service to process cow reports and sync them to Supabase.
 */
class DataProcessor {
  /**
   * Fetches the first organization ID to use as a default for the "one farmer" setup.
   */
  async getDefaultOrganizationId() {
    if (!supabase) return null;
    const { data, error } = await supabase.from('organizations').select('id').limit(1);
    if (error) {
      console.error('[DataProcessor] Error fetching organization:', error.message);
      return null;
    }
    return data && data.length > 0 ? data[0].id : null;
  }

  /**
   * Processes a single CSV file and upserts records to Supabase.
   */
  async processFile(filePath, orgId) {
    console.log(`[DataProcessor] Processing file: ${path.basename(filePath)}`);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Find the real header line (some files have a garbage first line)
    const lines = content.split(/\r?\n/);
    let headerLineIndex = -1;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (lines[i].includes('Animal Number') || lines[i].includes('Animal Tag Id')) {
        headerLineIndex = i;
        break;
      }
    }

    // If we can't find a header, try parsing from the first line anyway
    const startLine = headerLineIndex !== -1 ? headerLineIndex + 1 : 1;

    // Parse CSV
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      from_line: startLine,
      bom: true
    });

    const cowsToUpsert = records.map(record => {
      // Different reports might have slightly different column names
      const animalNumber = (record['Animal Number'] || record['Animal Tag Id'] || '').trim();
      
      // Ignore empty, non-numeric (SUM, AVG, etc), or zero animal numbers
      if (!animalNumber || isNaN(animalNumber) || animalNumber === '0') {
        return null;
      }

      // Clean sensor data
      const cleanedSensors = mapSensorData(
        record['Sensor'] || '',
        record['Value'] || '',
        record['Severeness'] || ''
      );

      return {
        organization_id: orgId,
        animal_number: animalNumber,
        cow_group: record['Group'] || null,
        lactation_days: cleanNumber(record['Lactation days']),
        day_production: cleanNumber(record['Day Production (24h)']),
        sensors: cleanedSensors.sensors,
        severeness: cleanedSensors.severeness,
        sick_chance: cleanNumber(record['Sick Chance']),
        sick_change_status: record['Sick Change Status'] || null,
        updated_at: new Date().toISOString()
      };
    }).filter(Boolean);

    // De-duplicate: Postgres upsert fails if the same key appears twice in one batch
    const uniqueCows = Array.from(
      cowsToUpsert.reduce((map, cow) => {
        map.set(cow.animal_number, cow);
        return map;
      }, new Map()).values()
    );

    if (uniqueCows.length === 0) return 0;

    // Supabase Upsert
    const { error } = await supabase
      .from('cow_data')
      .upsert(uniqueCows, { onConflict: 'organization_id, animal_number' });

    if (error) {
      console.error(`[DataProcessor] Error upserting ${path.basename(filePath)}:`, error.message);
      return 0;
    }

    const count = uniqueCows.length;
    console.log(`[DataProcessor] Upserted ${count} records from ${path.basename(filePath)}`);
    return count;
  }

  /**
   * Scans the data directory and processes all CSV files.
   */
  async syncAll() {
    if (!supabase) {
      console.error('[DataProcessor] Supabase client not initialized.');
      return;
    }

    const orgId = await this.getDefaultOrganizationId();
    if (!orgId) {
      console.error('[DataProcessor] No organization found. Cannot sync data.');
      return;
    }

    try {
      const files = await fs.readdir(DATA_DIR);
      // Filter for CSV files and skip Historical reports
      const csvFiles = files.filter(f => 
        f.endsWith('.csv') && !f.toLowerCase().includes('historical')
      );

      let totalUpserted = 0;
      for (const file of csvFiles) {
        const filePath = path.join(DATA_DIR, file);
        const count = await this.processFile(filePath, orgId);
        totalUpserted += count;
      }

      console.log(`[DataProcessor] Sync complete. Total records processed: ${totalUpserted}`);
    } catch (err) {
      console.error('[DataProcessor] Sync failed:', err.message);
    }
  }
}

module.exports = new DataProcessor();
