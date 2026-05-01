import { formatAllDates, stripNulls, stripHtmlFromValues, omitFields } from '../services/data-prep/utils';
import supabase from '../services/supabase';

export const get_cow_info = {
  definition: {
    type: "function",
    function: {
      name: "get_cow_info",
      description: "Get detailed health, production, and reproduction info for a specific cow by number. Returns all relevant fields: production (kg/day), lactation info, reproduction status, health alerts, sensor data, milking stats, and treatment details. Use when the farmer asks about a specific cow.",
      parameters: {
        type: "object",
        properties: {
          animalNumber: { type: "string", description: "The cow's animal number (e.g., '250')." }
        },
        required: ["animalNumber"]
      }
    }
  },
  async handler({ animalNumber }: { animalNumber: string }) {
    if (!supabase) return "Supabase not initialized.";

    const { data, error } = await (supabase as any)
      .from('cow_data')
      .select('*')
      .eq('animal_number', animalNumber.toString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return `Cow ${animalNumber} not found in the records.`;
      return `Error retrieving cow data: ${error.message}`;
    }

    return stripNulls(stripHtmlFromValues(omitFields(formatAllDates(data))));
  }
};

export const get_group_status = {
  definition: {
    type: "function",
    function: {
      name: "get_group_status",
      description: "Get summary stats for a cow group by group number (e.g., '3', '5') or partial name. Returns: total cows, average daily production (kg/day), cows at health risk, average lactation days, count pregnant, and count in heat. Use when the farmer asks about a group or pen.",
      parameters: {
        type: "object",
        properties: {
          groupName: { type: "string", description: "Group number or name (e.g., '3', '5', 'North')." }
        },
        required: ["groupName"]
      }
    }
  },
  async handler({ groupName }: { groupName: string }) {
    if (!supabase) return "Supabase not initialized.";
    const { data, error } = await (supabase as any)
      .from('cow_data')
      .select('*')
      .ilike('group_number', `%${groupName}%`);

    if (error) return `Error fetching group status: ${error.message}`;
    if (!data || data.length === 0) return `No cows found in group "${groupName}".`;

    const avgProduction = data.reduce((acc: number, c: any) => acc + (c.day_production || 0), 0) / data.length;
    const avgLactationDays = data.reduce((acc: number, c: any) => acc + (c.lactation_days || 0), 0) / data.length;
    const sickCount = data.filter((c: any) => c.sick_chance === true).length;
    const pregnantCount = data.filter((c: any) => c.days_pregnant && c.days_pregnant > 0).length;
    const inHeatCount = data.filter((c: any) => c.heat_probability_max && c.heat_probability_max > 50).length;

    return {
      group: groupName,
      total_cows: data.length,
      average_daily_production_kg: parseFloat(avgProduction.toFixed(1)),
      average_lactation_days: Math.round(avgLactationDays),
      cows_at_health_risk: sickCount,
      cows_pregnant: pregnantCount,
      cows_in_heat: inHeatCount
    };
  }
};
