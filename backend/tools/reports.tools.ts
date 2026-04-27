import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates } from '../services/data-prep/utils';

/**
 * Tools for fetching specific farmer reports.
 */

export const get_fetch_report = {
  definition: {
    type: "function",
    function: {
      name: "get_fetch_report",
      description: "Get the 'Fetch' report which lists cows that may need attention or fetching for milking. Includes lactation details, production, and pregnancy status.",
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
      .select('animal_number, lactation_no, lactation_days, time_away, interval_exceeded, milk_yield_expected, day_production, failed_milking, days_pregnant');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the fetch report.`;
      return `Error fetching fetch report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the fetch report.";
  }
};

export const get_milk_separation_report = {
  definition: {
    type: "function",
    function: {
      name: "get_milk_separation_report",
      description: "Get the 'Milk Separation' report detailing cows whose milk is being diverted. Includes separation status, start/end dates, reason (disease), and tank information.",
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
      .select('animal_number, group_number, lactation_no, lactation_days, disease_name, milk_separation_start_date, milk_separation_end_date, milk_separation_status, day_production, milk_separation_type, milk_separation_tank, hot_rinse_activated');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the milk separation report.`;
      return `Error fetching milk separation report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the milk separation report.";
  }
};

export const get_health_treatment_report = {
  definition: {
    type: "function",
    function: {
      name: "get_health_treatment_report",
      description: "Get the 'Health Treatment' report, listing medical treatments, dosages, and application details for cows.",
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
      .select('animal_number, animal_name, location, expected_application_date, medicine_dosage, dosage_unit, treatment_description, claw_teat, treatment_plan_name, disease_name, last_routing_visit_direction, route_of_administration, mus_id, medicine_name, lactation_days, lactation_no');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the health treatment report.`;
      return `Error fetching health treatment report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the health treatment report.";
  }
};

export const get_health_report = {
  definition: {
    type: "function",
    function: {
      name: "get_health_report",
      description: "Get the general 'Health' report, including production, sensor alerts, and sick chance.",
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
      .select('animal_number, group_number, lactation_days, day_production, sensors, severeness, sick_chance');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the health report.`;
      return `Error fetching health report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the health report.";
  }
};

export const get_heat_insemination_report = {
  definition: {
    type: "function",
    function: {
      name: "get_heat_insemination_report",
      description: "Get the 'Heat and Insemination' report, tracking reproductive status and heat data.",
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
      .select('animal_number, lactation_no, lactation_days, age, insemination_no, reproduction_status, day_production, on_set_of_heat, time_away, heat_probability_max, optimum_insemination_moment, insemination_remarks, hours_since_heat');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the heat and insemination report.`;
      return `Error fetching heat and insemination report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the heat and insemination report.";
  }
};

export const get_heat_probability_report = {
  definition: {
    type: "function",
    function: {
      name: "get_heat_probability_report",
      description: "Get the 'Heat Probability' report, focusing on cows likely to be in heat and their optimum insemination timing.",
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
      .select('animal_number, group_number, lactation_no, lactation_days, reproduction_status, last_insemination, days_since_heat, on_set_of_heat, hours_since_heat, heat_probability_max, day_production, day_production_deviation, optimum_insemination_moment, health_remark');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the heat probability report.`;
      return `Error fetching heat probability report: ${error.message}`;
    }

    if (data) {
      // Calculate since_insemination for each cow
      const calculateSinceInsemination = (cow: any) => {
        if (cow.last_insemination) {
          const lastDate = new Date(cow.last_insemination);
          if (!isNaN(lastDate.getTime())) {
            const today = new Date();
            const diffMs = today.getTime() - lastDate.getTime();
            cow.since_insemination = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          }
        }
        return cow;
      };

      const processed = Array.isArray(data) ? data.map(calculateSinceInsemination) : calculateSinceInsemination(data);
      return formatAllDates(processed);
    }
    return "No cows found for the heat probability report.";
  }
};

export const get_calving_report = {
  definition: {
    type: "function",
    function: {
      name: "get_calving_report",
      description: "Get the 'Calving' report, monitoring cows near calving or in early lactation.",
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
      .select('animal_number, robot, group_number, location, lactation_no, lactation_days, time_away, interval_exceeded, milk_yield_expected, day_production, failures, milk_frequency, days_pregnant, milkings');

    if (orgId) query = query.eq('organization_id', orgId);
    if (animalNumber) {
      query = query.eq('animal_number', animalNumber).single();
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the calving report.`;
      return `Error fetching calving report: ${error.message}`;
    }

    if (data) {
      return formatAllDates(data);
    }
    return "No cows found for the calving report.";
  }
};
