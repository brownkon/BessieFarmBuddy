const supabase = require('../services/supabase');
const { getUserOrganization } = require('./utils');

const getReproductionStatus = {
  definition: {
    type: "function",
    function: {
      name: "get_cows_by_reproduction_status",
      description: "Get a list of cows matching a specific reproduction status (e.g., Pregnant, In heat, Dry).",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "The reproduction status to filter by." }
        },
        required: ["status"]
      }
    }
  },
  async handler({ status }, context = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;
    
    let query = supabase.from('cow_data')
      .select('animal_number, reproduction_status, expected_calving_date, days_pregnant')
      .ilike('reproduction_status', `%${status}%`);
      
    if (orgId) query = query.eq('organization_id', orgId);

    const { data, error } = await query;
    if (error) return `Error fetching status: ${error.message}`;
    if (data.length === 0) return `No cows found with status containing "${status}".`;
    return data;
  }
};

module.exports = {
  get_cows_by_reproduction_status: getReproductionStatus
};
