import fs from 'fs-extra';
import path from 'path';
import { parse } from 'csv-parse/sync';
import supabase from '../supabase';
import {
  cleanNumber,
  mapSensorData,
  formatDate,
  parseBoolean,
  parseRomanToNumber,
  extractOptimumMoment,
  stripHtml
} from './cleaner';

const DATA_DIR = path.join(__dirname, '../../../data/CSV');

/**
 * Normalizes field names and types for internal processing.
 */
interface CowRecord {
  organization_id: string;
  animal_number: number;
  animal_tag_id?: string | null;
  animal_name?: string | null;
  cow_group?: string | null;
  location?: string | null;
  robot?: string | null;
  age?: number | null;
  lactation_no?: number | null;
  lactation_days?: number | null;
  lactation_day_category?: number | null;
  days_pregnant?: number | null;
  reproduction_status?: string | null;
  days_since_heat?: number | null;
  last_heat?: string | null;
  last_insemination?: string | null;
  insemination_no?: number | null;
  days_since_insemination?: number | null;
  heat_probability_max?: number | null;
  optimum_insemination_moment?: number | null;
  on_set_of_heat?: string | null;
  hours_since_heat?: number | null;
  sire?: string | null;
  expected_calving_date?: string | null;
  pregnancy_remark?: string | null;
  calving_remark?: string | null;
  health_remark?: string | null;
  insemination_moment?: string | null;
  remarks?: string | null;
  day_production?: number | null;
  day_production_deviation?: number | null;
  milk_yield_expected?: number | null;
  milk_frequency?: number | null;
  milkings?: number | null;
  failures?: number | null;
  failed_milking?: boolean;
  interval_exceeded?: number | null;
  time_away?: string | null;
  too_late_for_milking?: boolean;
  activity?: boolean;
  sick_chance?: boolean;
  disease_name?: string | null;
  milk_separation_status?: string | null;
  milk_separation_type?: string | null;
  milk_separation_tank?: string | null;
  milk_separation_start_date?: string | null;
  milk_separation_end_date?: string | null;
  milk_separation_remaining_days?: number | null;
  hot_rinse_activated?: boolean;
  medicine_name?: string | null;
  medicine_dosage?: number | null;
  dosage_unit?: string | null;
  treatment_plan_name?: string | null;
  treatment_description?: string | null;
  expected_application_date?: string | null;
  route_of_administration?: string | null;
  claw_teat?: string | null;
  last_routing_visit_direction?: string | null;
  mus_id?: number | null;
  sensors?: any;
  severeness?: any;
}

export class DataProcessor {
  async getDefaultOrganizationId(): Promise<string | null> {
    if (!supabase) return null;
    const { data, error } = await (supabase as any).from('organizations').select('id').limit(1);
    if (error) return null;
    return data && data.length > 0 ? data[0].id : null;
  }

  async parseFile(filePath: string, orgId: string): Promise<Map<number, CowRecord>> {
    const fileName = path.basename(filePath);
    console.log(`[DataProcessor] Parsing: ${fileName}`);
    const content = await fs.readFile(filePath, 'utf-8');

    // Find header line
    const lines = content.split(/\r?\n/);
    let headerLineIndex = lines.findIndex(l => l.includes('Animal Number') || l.includes('Animal Tag Id'));
    if (headerLineIndex === -1) headerLineIndex = 0;

    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      from_line: headerLineIndex + 1,
      bom: true,
      trim: true
    });

    const cowMap = new Map<number, CowRecord>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    records.forEach((r: any) => {
      const rawAnimalNumber = (r['Animal Number'] || r['Animal Tag Id'] || '').trim();
      if (!rawAnimalNumber || rawAnimalNumber === '0' || isNaN(rawAnimalNumber as any)) return;

      const animalNumber = parseInt(rawAnimalNumber, 10);
      const cleanedSensors = mapSensorData(r['Sensor'] || '', r['Value'] || '', r['Severeness'] || '');

      // Calculate Days Pregnant from 'Pregnant since' if possible
      let daysPregnant = cleanNumber(r['Days Pregnant']);
      if (!daysPregnant && r['Pregnant since']) {
        const psDate = new Date(r['Pregnant since']);
        if (!isNaN(psDate.getTime())) {
          const diffMs = today.getTime() - psDate.getTime();
          daysPregnant = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }

      const data: CowRecord = {
        organization_id: orgId,
        animal_number: animalNumber,
        animal_tag_id: r['Animal Tag Id'],
        animal_name: r['Animal Name'],
        cow_group: r['Group'],
        location: r['Location'],
        robot: r['Robot'],
        age: cleanNumber(r['Age']),
        lactation_no: cleanNumber(r['Lactation Number']),
        lactation_days: cleanNumber(r['Lactation Days']),
        lactation_day_category: parseRomanToNumber(r['Lactation day category']),
        days_pregnant: daysPregnant,
        reproduction_status: r['Reproduction Status'] || r['Status'],
        days_since_heat: cleanNumber(r['Days since heat']),
        last_heat: formatDate(r['Last Heat']),
        last_insemination: formatDate(r['Last Insemination']),
        insemination_no: cleanNumber(r['Insemination Number']) || cleanNumber(r['Insemination number']),
        days_since_insemination: cleanNumber(r['Since Insemination']),
        heat_probability_max: cleanNumber(r['Heat Probability Max.']),
        optimum_insemination_moment: extractOptimumMoment(r['Optimum Insemination Moment']),
        on_set_of_heat: r['On set of heat'] || null,
        hours_since_heat: cleanNumber(r['Hours since heat']),
        sire: r['Sire'],
        expected_calving_date: formatDate(r['Expected Calving Date']) || formatDate(r['Date']),
        pregnancy_remark: r['Pregnancy Remark'],
        calving_remark: r['Calving Remark'],
        health_remark: r['Health remark'],
        insemination_moment: r['Insemination moment'],
        remarks: r['Remarks'],
        day_production: cleanNumber(r['Day Production']) || cleanNumber(r['day production']),
        day_production_deviation: cleanNumber(r['day production deviation']),
        milk_yield_expected: cleanNumber(r['Milk Yield Expected']),
        milk_frequency: cleanNumber(r['Milk frequency']),
        milkings: cleanNumber(r['milkings']),
        failures: cleanNumber(r['failures']),
        failed_milking: parseBoolean(r['Failed Milking']),
        interval_exceeded: cleanNumber(r['Interval Exceed']),
        time_away: r['Away'],
        too_late_for_milking: parseBoolean(r['Too Late for Milking']),
        activity: parseBoolean(r['Activity']),
        sick_chance: parseBoolean(r['Sick Chance']),
        disease_name: r['Disease Name'],
        milk_separation_status: r['Milk Separation Status'],
        milk_separation_type: r['Milk Separation Type'],
        milk_separation_tank: r['Milk Separation Tank'],
        milk_separation_start_date: formatDate(r['Milk Separation Start Date']),
        milk_separation_end_date: formatDate(r['Milk Separation End Date']),
        milk_separation_remaining_days: cleanNumber(r['Milk Separation Remaining Days']),
        hot_rinse_activated: parseBoolean(r['Hot Rinse Activated']),
        medicine_name: r['Medicine Name'],
        medicine_dosage: cleanNumber(r['Medicine Dosage']),
        dosage_unit: r['Dosage Unit'],
        treatment_plan_name: r['Treatment Plan Name'],
        treatment_description: r['Description'],
        expected_application_date: formatDate(r['Expected application done date time']),
        route_of_administration: r['Route of Administration'],
        claw_teat: r['Claw/Teat'],
        last_routing_visit_direction: r['Last Routing Visit Direction'],
        mus_id: cleanNumber(r['MusId']),

        sensors: Object.keys(cleanedSensors.sensors).length > 0 ? cleanedSensors.sensors : null,
        severeness: Object.keys(cleanedSensors.severeness).length > 0 ? cleanedSensors.severeness : null,
      };

      cowMap.set(animalNumber, data);
    });

    return cowMap;
  }

  mergeCowData(existing: CowRecord, incoming: CowRecord): CowRecord {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(incoming)) {
      if (value !== null && value !== undefined && value !== '') {
        const existingValue = (merged as any)[key];

        // Special handling for booleans: keep true if either is true
        if (typeof value === 'boolean' && typeof existingValue === 'boolean') {
          (merged as any)[key] = existingValue || value;
        } else if ((key === 'sensors' || key === 'severeness') && existingValue && typeof existingValue === 'object') {
          (merged as any)[key] = { ...existingValue, ...(value as object) };
        } else {
          (merged as any)[key] = value;
        }
      }
    }
    return merged;
  }

  async syncAll(): Promise<void> {
    const orgId = await this.getDefaultOrganizationId();
    if (!orgId) return;

    try {
      const files = await fs.readdir(DATA_DIR);
      const csvFiles = files.filter(f => f.endsWith('.csv'));

      const masterMap = new Map<number, CowRecord>();

      for (const file of csvFiles) {
        const fileMap = await this.parseFile(path.join(DATA_DIR, file), orgId);
        for (const [id, data] of fileMap) {
          if (masterMap.has(id)) {
            masterMap.set(id, this.mergeCowData(masterMap.get(id)!, data));
          } else {
            masterMap.set(id, data);
          }
        }
      }

      const allCows = Array.from(masterMap.values());
      console.log(`[DataProcessor] Syncing ${allCows.length} cows...`);

      // Identify columns that are all null
      if (allCows.length > 0) {
        const firstCow = allCows[0];
        const allKeys = Object.keys(firstCow) as (keyof CowRecord)[];
        const nonNullKeys = new Set<keyof CowRecord>();

        allCows.forEach(cow => {
          allKeys.forEach(key => {
            const val = cow[key];
            if (val !== null && val !== undefined && val !== '') {
              nonNullKeys.add(key);
            }
          });
        });

        const allNullKeys = allKeys.filter(k => !nonNullKeys.has(k));
        if (allNullKeys.length > 0) {
          console.log(`[DataProcessor] Warning: The following columns are empty across all records: ${allNullKeys.join(', ')}`);
        }
      }

      const { error } = await (supabase as any)
        .from('cow_data')
        .upsert(allCows, { onConflict: 'organization_id, animal_number' });

      if (error) throw error;
      console.log('[DataProcessor] Sync successful.');
    } catch (err: any) {
      console.error('[DataProcessor] Sync failed:', err.message);
    }
  }
}

export default new DataProcessor();
