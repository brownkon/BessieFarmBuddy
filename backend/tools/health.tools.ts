import { formatAllDates, stripNulls, stripHtmlFromValues, omitFields } from '../services/data-prep/utils';
import supabase from '../services/supabase';

export const get_health_alerts = {
  definition: {
    type: "function",
    function: {
      name: "get_health_alerts",
      description: "Get cows currently flagged with health alerts or active sensor warnings. Returns: animal_number, sick_chance (boolean), sick_change_status, sensor details, and disease name. Use when the farmer asks about sick cows, health alerts, or sensor warnings.",
      parameters: { type: "object", properties: {} }
    }
  },
  async handler(_: any, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";
    const { getUserOrganization } = await import('../services/data-prep/utils');
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;

    let query = (supabase as any)
      .from('cow_data')
      .select('*')
      .eq('sick_chance', true);

    if (orgId) query = query.eq('organization_id', orgId);

    const { data, error } = await query;
    if (error) return `Error fetching health alerts: ${error.message}`;
    if (!data || data.length === 0) return "No health alerts at this time.";

    return stripNulls(stripHtmlFromValues(omitFields(formatAllDates(data))));
  }
};
