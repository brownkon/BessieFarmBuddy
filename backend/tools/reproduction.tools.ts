import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates, stripNulls, omitFields } from '../services/data-prep/utils';

export const get_pregnancy_status = {
  definition: {
    type: "function",
    function: {
      name: "get_pregnancy_status",
      description: "Get pregnancy and reproduction status for all cows (or a specific cow). Returns: animal_number, reproduction_status, days_pregnant, expected_calving_date, last_insemination, insemination_no, sire, pregnancy_remark, calving_remark. Use when the farmer asks about breeding, pregnancy, calving dates, or reproduction.",
      parameters: {
        type: "object",
        properties: {
          animalNumber: { type: "string", description: "Optional: Filter for a specific cow number." }
        }
      }
    }
  },
  async handler({ animalNumber }: { animalNumber?: string } = {}, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;

    let query = (supabase as any)
      .from('cow_data')
      .select('*');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found.`;
      return `Error fetching pregnancy data: ${error.message}`;
    }

    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows found.";

    return stripNulls(omitFields(formatAllDates(data)));
  }
};
