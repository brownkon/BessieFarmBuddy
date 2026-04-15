const { formatAllDates } = require('./utils');
const supabase = require('../services/supabase');

const cowHealth = {
  definition: {
    type: "function",
    function: {
      name: "get_cow_health",
      description: "Get health status and production for a specific cow.",
      parameters: {
        type: "object",
        properties: {
          animalNumber: { type: "string", description: "The cow's ID number." }
        },
        required: ["animalNumber"]
      }
    }
  },
  async handler({ animalNumber }) {
    if (!supabase) return "Supabase not initialized.";
    const { data, error } = await supabase
      .from('cow_data')
      .select('animal_number, sick_chance, day_production, sensors, updated_at')
      .eq('animal_number', animalNumber.toString())
      .single();

    if (error) {
      if (error.code === 'PGRST116') return `Cow ${animalNumber} not found.`;
      return `Error: ${error.message}`;
    }

    // Automatically format all date strings
    return formatAllDates(data);
  }
};

module.exports = {
  get_cow_health: cowHealth
};
