const supabase = require('../services/supabase');
const { getUserOrganization, formatAllDates } = require('./utils');

const pregnancyStatus = {
  definition: {
    type: "function",
    function: {
      name: "get_pregnancy_status",
      description: "Get pregnancy info for all cows.",
      parameters: { type: "object", properties: {} }
    }
  },
  async handler(_, context = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;

    let query = supabase
      .from('cow_data')
      .select('animal_number, reproduction_status, expected_calving_date, days_pregnant');
    
    if (orgId) query = query.eq('organization_id', orgId);

    const { data, error } = await query;
    if (error) return `Error fetching pregnancy data: ${error.message}`;
    if (data.length === 0) return "No cows found.";

    // Automatically format all date strings in the result set
    return formatAllDates(data);
  }
};

module.exports = {
  get_pregnancy_status: pregnancyStatus
};
