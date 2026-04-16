import { formatAllDates } from '../services/data-prep/utils';
import supabase from '../services/supabase';

export const get_health_alerts = {
  definition: {
    type: "function",
    function: {
      name: "get_health_alerts",
      description: "Get cows with high sick chance or alerts.",
      parameters: { type: "object", properties: {} }
    }
  },
  async handler() {
    if (!supabase) return "Supabase not initialized.";
    const { data, error } = await (supabase as any)
      .from('cow_data')
      .select('animal_number, sick_chance, sick_change_status, sensors')
      .gt('sick_chance', 50)
      .order('sick_chance', { ascending: false });

    if (error) return `Error fetching health alerts: ${error.message}`;
    if (data && data.length > 0) {
      return formatAllDates(data);
    }
    return data;
  }
};
