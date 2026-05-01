import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates, stripNulls } from '../services/data-prep/utils';

/** Whitelist of valid metric column names to prevent SQL injection. */
const VALID_METRICS = new Set([
  'day_production', 'day_production_deviation', 'milk_yield_expected', 'milk_frequency',
  'milkings', 'failures', 'sick_chance', 'lactation_days', 'lactation_no',
  'days_pregnant', 'days_since_heat', 'heat_probability_max', 'hours_since_heat',
  'interval_exceeded', 'age', 'insemination_no', 'milk_separation_remaining_days',
  'reproduction_status', 'disease_name', 'group_number'
]);

export const get_specific_metric = {
  definition: {
    type: "function",
    function: {
      name: "get_specific_metric",
      description: "Retrieve a specific metric for all cows with summary statistics. Valid metrics: day_production (kg/day), milk_yield_expected (kg), milk_frequency, milkings, failures, sick_chance, lactation_days, lactation_no, days_pregnant, days_since_heat, heat_probability_max, hours_since_heat, interval_exceeded (hours overdue), age (years), insemination_no, reproduction_status, disease_name, group_number. Returns: per-cow values plus min/max/average where numeric.",
      parameters: {
        type: "object",
        properties: {
          metric_name: {
            type: "string",
            description: "The exact column name to retrieve (e.g., 'day_production', 'sick_chance', 'days_pregnant').",
            enum: Array.from(VALID_METRICS)
          }
        },
        required: ["metric_name"]
      }
    }
  },
  async handler({ metric_name }: { metric_name: string }, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";

    // Validate metric name against whitelist
    if (!VALID_METRICS.has(metric_name)) {
      return `Invalid metric "${metric_name}". Valid metrics: ${Array.from(VALID_METRICS).join(', ')}`;
    }

    const orgId = context.userId ? await getUserOrganization(context.userId) : null;

    let query = (supabase as any).from('cow_data').select('*');
    if (orgId) query = query.eq('organization_id', orgId);

    const { data, error } = await query;
    if (error) return `Error retrieving metric: ${error.message}`;
    if (!data || data.length === 0) return "No cows found.";

    const { pickFields } = await import('../services/data-prep/utils');
    const formattedData = stripNulls(formatAllDates(pickFields(data, ['animal_number', metric_name])));

    // Calculate summary statistics for numeric metrics
    const numericValues = data
      .map((c: any) => c[metric_name])
      .filter((v: any) => typeof v === 'number' && !isNaN(v));

    const summary: any = {
      metric: metric_name,
      total_cows: data.length
    };

    if (numericValues.length > 0) {
      summary.min = parseFloat(Math.min(...numericValues).toFixed(2));
      summary.max = parseFloat(Math.max(...numericValues).toFixed(2));
      summary.average = parseFloat((numericValues.reduce((a: number, b: number) => a + b, 0) / numericValues.length).toFixed(2));
      summary.cows_with_data = numericValues.length;
    }

    return { ...summary, data: formattedData };
  }
};
