const supabase = require('../services/supabase');
const { getUserOrganization, formatAllDates } = require('./utils');

const getSpecificMetric = {
  definition: {
    type: "function",
    function: {
      name: "get_specific_metric",
      description: "Retrieve a specific metric column for all cows.",
      parameters: {
        type: "object",
        properties: {
          metric_name: { type: "string", description: "The exact name of the column/metric to retrieve (e.g. day_production, rumination_minutes, sick_chance)." }
        },
        required: ["metric_name"]
      }
    }
  },
  async handler({ metric_name }, context = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;
    
    let query = supabase.from('cow_data').select(`animal_number, ${metric_name}`);
    if (orgId) query = query.eq('organization_id', orgId);

    const { data, error } = await query;
    if (error) return `Error retrieving metric: ${error.message}`;
    
    if (data.length === 0) return "No cows found.";

    // Automatically format any date strings found in the results
    const formattedData = formatAllDates(data);

    return formattedData.map(c => {
      const val = c[metric_name];
      return `${c.animal_number}: ${val !== null && val !== undefined ? val : 'N/A'}`;
    }).join('\n');
  }
};

module.exports = {
  get_specific_metric: getSpecificMetric
};
