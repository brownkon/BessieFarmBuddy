const fs = require('fs-extra');
const path = require('path');
const { parse } = require('csv-parse/sync');
const supabase = require('../supabase');
const { cleanNumber, mapSensorData, formatDate } = require('./cleaner.js');

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
   * Parses a single CSV file and returns records as a Map.
   */
  async parseFile(filePath, orgId) {
    console.log(`[DataProcessor] Parsing file: ${path.basename(filePath)}`);
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Find the real header line (some files have a garbage first line)
    const lines = content.split(/\r?\n/);
    let headerLineIndex = -1;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (lines[i].includes('Animal Number') || lines[i].includes('Animal Tag Id') || lines[i].includes('Animal Life No')) {
        headerLineIndex = i;
        break;
      }
    }

    const startLine = headerLineIndex !== -1 ? headerLineIndex + 1 : 1;

    // Parse CSV with duplicate column handling
    const records = parse(content, {
      columns: header => {
        const counts = {};
        return header.map(col => {
          const name = col.trim();
          counts[name] = (counts[name] || 0) + 1;
          return counts[name] > 1 ? `${name}_${counts[name]}` : name;
        });
      },
      skip_empty_lines: true,
      relax_column_count: true,
      from_line: startLine,
      bom: true
    });

    const cowMap = new Map();

    records.forEach(record => {
      const animalNumber = (record['Animal Number'] || record['Animal Tag Id'] || '').trim();
      
      // Skip sum/avg lines and internal markers
      if (!animalNumber || isNaN(animalNumber) || animalNumber === '0' || animalNumber === 'SUM' || animalNumber === 'AVG') {
        return;
      }

      const cleanedSensors = mapSensorData(
        record['Sensor'] || '',
        record['Value'] || '',
        record['Severeness'] || ''
      );

      const cowData = {
        organization_id: orgId,
        animal_number: animalNumber,
        cow_group: record['Group'] || record['Group Number'] || null,
        location: record['Location'] || null,
        robot: record['Robot'] || null,
        animal_tag_id: record['Animal Tag Id'] || null,
        animal_life_no: record['Animal Life No. '] || record['Animal Life No.'] || null,
        lactation_no: cleanNumber(record['Lactation No.']),
        lactation_days: cleanNumber(record['Lactation days']),
        day_production: cleanNumber(record['Day Production (24h)']) || cleanNumber(record['Day Production']),
        day_production_deviation: cleanNumber(record['Day Production (24h) Deviation']),
        reproduction_status: record['Reproduction Status'] || record['Pregnancy Status'] || null,
        last_insemination: formatDate(record['Last Insemination']),
        days_pregnant: cleanNumber(record['Days Pregnant']),
        days_to_dry_off: cleanNumber(record['Days to Dry Off']),
        expected_calving_date: formatDate(record['Expected Calving Date'] || record['Expected Calving']),
        production_status: record['Production Status'] || null,
        gender: record['Gender'] || null,
        
        // Extended Fields
        rest_feed: cleanNumber(record['Rest Feed']),
        failures: cleanNumber(record['Failures']),
        failed_milking: cleanNumber(record['Failed Milking']),
        milkings_lactation: cleanNumber(record['Milkings']),
        milkings_milk: cleanNumber(record['Milkings_2']),
        fat_protein_ratio: cleanNumber(record['Fat/Protein Ratio']),
        nr_of_refusal: cleanNumber(record['Nr of Refusal']),
        color_code: record['Color Code LF-LR-RF-RR'] || null,
        end_milk_till: formatDate(record['End Milk Till']),
        milk_separation: record['Milk Separation'] || null,
        body_score: cleanNumber(record['Body Score']),
        intake_total: cleanNumber(record['Intake Total']),
        rest_feed_total: cleanNumber(record['Rest Feed Total']),
        scc_indication: cleanNumber(record['SCC Indication']),
        last_fertility_diagnose: formatDate(record['Last Fertility Diagnose']),
        last_fertility_remarks: record['Last Fertility Remarks'] || null,
        last_fertility: formatDate(record['Last Fertility']),
        days_since_heat: cleanNumber(record['Days Since Heat']),
        insemination_no: cleanNumber(record['Insemination No.']),
        pregnancy_check_date: formatDate(record['Pregnancy Check Date']),
        lf: cleanNumber(record['LF']),
        lr: cleanNumber(record['LR']),
        rr: cleanNumber(record['RR']),
        rf: cleanNumber(record['RF']),
        milk_temperature: cleanNumber(record['Milk Temperature']),
        rumination_herd: cleanNumber(record['Rumination Herd']),
        rumination_att_count: cleanNumber(record['Rumination Att. Count']),
        inversion_ketosis: record['Inversion/Ketosis'] || null,
        activity_deviation: cleanNumber(record['Activity Deviation']),
        rumination_minutes: cleanNumber(record['Rumination Minutes']),
        sire: record['Sire'] || null,
        inseminate: record['Inseminate'] || null,
        too_late_for_milking: record['Too Late for Milking'] || null,
        milk_visit_yield: cleanNumber(record['Milk Visit Yield']),
        last_milk: formatDate(record['Last Milk']),
        train_cow: record['Train Cow'] || null,
        calving_date: formatDate(record['Calving Date']),
        sick_chance: cleanNumber(record['Sick Chance']),
        sick_change_status: record['Sick Change Status'] || null,

        sensors: Object.keys(cleanedSensors.sensors).length > 0 ? cleanedSensors.sensors : null,
        severeness: Object.keys(cleanedSensors.severeness).length > 0 ? cleanedSensors.severeness : null,
        updated_at: new Date().toISOString()
      };

      cowMap.set(animalNumber, cowData);
    });

    return cowMap;
  }

  /**
   * Merges two cow data objects, keeping the most informative values.
   */
  mergeCowData(existing, incoming) {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== null && value !== undefined) {
        if ((key === 'sensors' || key === 'severeness') && merged[key] && typeof value === 'object') {
          merged[key] = { ...merged[key], ...value };
        } else {
          merged[key] = value;
        }
      }
    }
    return merged;
  }

  /**
   * Scans the data directory and processes all CSV files, merging them before sync.
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
      const csvFiles = files.filter(f => 
        f.endsWith('.csv') && !f.toLowerCase().includes('historical')
      );

      const masterCowMap = new Map();

      for (const file of csvFiles) {
        const filePath = path.join(DATA_DIR, file);
        const fileCowMap = await this.parseFile(filePath, orgId);
        
        for (const [animalNumber, data] of fileCowMap) {
          if (masterCowMap.has(animalNumber)) {
            masterCowMap.set(animalNumber, this.mergeCowData(masterCowMap.get(animalNumber), data));
          } else {
            masterCowMap.set(animalNumber, data);
          }
        }
      }

      const allCows = Array.from(masterCowMap.values());
      if (allCows.length === 0) {
        console.log('[DataProcessor] No records to sync.');
        return;
      }

      console.log(`[DataProcessor] Syncing ${allCows.length} unique cows to Supabase...`);

      // Supabase Upsert
      const { error } = await supabase
        .from('cow_data')
        .upsert(allCows, { onConflict: 'organization_id, animal_number' });

      if (error) {
        console.error('[DataProcessor] Error upserting to Supabase:', error.message);
      } else {
        console.log(`[DataProcessor] Sync complete. Successfully upserted ${allCows.length} records.`);
      }
    } catch (err) {
      console.error('[DataProcessor] Sync failed:', err.message);
    }
  }
}

module.exports = new DataProcessor();
