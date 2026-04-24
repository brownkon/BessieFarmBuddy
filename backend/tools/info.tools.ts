import { formatAllDates } from '../services/data-prep/utils';
import supabase from '../services/supabase';

export const get_cow_info = {
  definition: {
    type: "function",
    function: {
      name: "get_cow_info",
      description: "Get detailed health and production info for a specific cow.",
      parameters: {
        type: "object",
        properties: {
          animalNumber: { type: "string", description: "The cow's ID number." }
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

    // Automatically format all date strings in the data
    return formatAllDates(data);
  }
};

export const get_group_status = {
  definition: {
    type: "function",
    function: {
      name: "get_group_status",
      description: "Get summary for a specific group of cows (North, South, etc.)",
      parameters: {
        type: "object",
        properties: {
          groupName: { type: "string", description: "Name of the group." }
        },
        required: ["groupName"]
      }
    }
  },
  async handler({ groupName }: { groupName: string }) {
    if (!supabase) return "Supabase not initialized.";
    const { data, error } = await (supabase as any)
      .from('cow_data')
      .select('animal_number, sick_chance, day_production')
      .ilike('group_number', `%${groupName}%`);

    if (error) return `Error fetching group status: ${error.message}`;
    if (data.length === 0) return `No cows found in group "${groupName}".`;

    const avgProduct = data.reduce((acc: number, curr: any) => acc + (curr.day_production || 0), 0) / data.length;
    const sickCount = data.filter((c: any) => c.sick_chance > 50).length;

    return formatAllDates({
      group: groupName,
      total_cows: data.length,
      average_production: avgProduct.toFixed(2),
      cows_at_risk: sickCount
    });
  }
};
