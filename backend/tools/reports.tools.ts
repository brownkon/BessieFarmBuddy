import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates, stripNulls, stripHtmlFromValues, buildReportEnvelope, omitFields, pickFields } from '../services/data-prep/utils';

/**
 * Shared helper: builds a scoped query with select('*'), applies org and optional animalNumber filters.
 */
function buildQuery(orgId: string | null, animalNumber?: string) {
  let query = (supabase as any).from('cow_data').select('*');
  if (orgId) query = query.eq('organization_id', orgId);
  if (animalNumber) query = query.eq('animal_number', animalNumber).single();
  return query;
}

/**
 * Shared helper: cleans and wraps tool results for AI consumption.
 * - Formats dates, strips HTML, removes internal fields, strips nulls
 * - For arrays: picks only report-relevant fields and wraps in report envelope
 * - For single cow: returns full data with omitFields
 */
function formatResult(data: any, reportName: string, isSingle: boolean, fields?: string[]) {
  let cleaned = stripHtmlFromValues(omitFields(formatAllDates(data)));
  if (fields && !isSingle) {
    cleaned = pickFields(cleaned, fields);
  }
  cleaned = stripNulls(cleaned);
  if (isSingle) return cleaned;
  return buildReportEnvelope(reportName, cleaned);
}

// ─── Fetch Report ─────────────────────────────────────────────────────────────

const FETCH_FIELDS = ['animal_number', 'lactation_no', 'lactation_days', 'time_away', 'interval_exceeded', 'milk_yield_expected', 'day_production', 'failed_milking', 'days_pregnant'];

export const get_fetch_report = {
  definition: {
    type: "function",
    function: {
      name: "get_fetch_report",
      description: "Get cows that need to be fetched for milking due to missed milkings or exceeded intervals. Returns: animal_number, lactation_no, lactation_days, time_away (HH:MM), interval_exceeded (hours overdue), milk_yield_expected (kg), day_production (kg/day), failed_milking (bool), days_pregnant. Filters to only cows with overdue intervals or failed milkings. Use when the farmer asks about missed milkings, overdue cows, or cows needing to be fetched.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.or('interval_exceeded.gt.0,failed_milking.eq.true');
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the fetch report.`;
      return `Error fetching fetch report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently need fetching.";

    return formatResult(data, 'Fetch Report', !!animalNumber, FETCH_FIELDS);
  }
};

// ─── Milk Separation Report ──────────────────────────────────────────────────

const MILK_SEP_FIELDS = ['animal_number', 'group_number', 'lactation_no', 'lactation_days', 'disease_name', 'milk_separation_start_date', 'milk_separation_end_date', 'milk_separation_status', 'day_production', 'milk_separation_type', 'milk_separation_tank', 'hot_rinse_activated'];

export const get_milk_separation_report = {
  definition: {
    type: "function",
    function: {
      name: "get_milk_separation_report",
      description: "Get cows whose milk is currently being separated/diverted. Returns: animal_number, group_number, lactation_no, lactation_days, disease_name (reason for separation), milk_separation_start_date, milk_separation_end_date, milk_separation_status, day_production (kg/day), milk_separation_type, milk_separation_tank, hot_rinse_activated. Filters to only cows with active milk separation. Use when the farmer asks about separated milk, diverted milk, or antibiotic hold.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.not('milk_separation_status', 'is', null);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the milk separation report.`;
      return `Error fetching milk separation report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently have milk separation active.";

    return formatResult(data, 'Milk Separation Report', !!animalNumber, MILK_SEP_FIELDS);
  }
};

// ─── Health Treatment Report ─────────────────────────────────────────────────

const TREATMENT_FIELDS = ['animal_number', 'animal_name', 'location', 'expected_application_date', 'medicine_name', 'medicine_dosage', 'dosage_unit', 'treatment_description', 'claw_teat', 'treatment_plan_name', 'disease_name', 'last_routing_visit_direction', 'route_of_administration', 'mus_id', 'lactation_days', 'lactation_no'];

export const get_health_treatment_report = {
  definition: {
    type: "function",
    function: {
      name: "get_health_treatment_report",
      description: "Get cows currently receiving medical treatment. Returns: animal_number, animal_name, location, expected_application_date, medicine_name, medicine_dosage, dosage_unit, treatment_description, claw_teat (affected area), treatment_plan_name, disease_name, route_of_administration, lactation_days, lactation_no. Filters to only cows with active treatments. Use when the farmer asks about treatments, medications, dosages, or medical plans.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.or('medicine_name.not.is.null,treatment_plan_name.not.is.null');
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the health treatment report.`;
      return `Error fetching health treatment report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently receiving treatment.";

    return formatResult(data, 'Health Treatment Report', !!animalNumber, TREATMENT_FIELDS);
  }
};

// ─── Health Report ───────────────────────────────────────────────────────────

const HEALTH_FIELDS = ['animal_number', 'group_number', 'lactation_days', 'day_production', 'sensors', 'severeness', 'sick_chance', 'disease_name'];

export const get_health_report = {
  definition: {
    type: "function",
    function: {
      name: "get_health_report",
      description: "Get the general health overview for all cows, sorted by health risk. Returns: animal_number, group_number, lactation_days, day_production (kg/day), sensors (sensor alert details), severeness (alert severity), sick_chance (boolean), disease_name. Sorted with sick cows first. Use when the farmer asks for a general health overview or herd health status.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.order('sick_chance', { ascending: false, nullsFirst: false });
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the health report.`;
      return `Error fetching health report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows found for the health report.";

    return formatResult(data, 'Health Report', !!animalNumber, HEALTH_FIELDS);
  }
};

// ─── Heat & Insemination Report ──────────────────────────────────────────────

const HEAT_INSEM_FIELDS = ['animal_number', 'lactation_no', 'lactation_days', 'age', 'insemination_no', 'reproduction_status', 'day_production', 'on_set_of_heat', 'time_away', 'heat_probability_max', 'optimum_insemination_moment', 'insemination_remarks', 'hours_since_heat'];

export const get_heat_insemination_report = {
  definition: {
    type: "function",
    function: {
      name: "get_heat_insemination_report",
      description: "Get cows with heat and insemination activity. Returns: animal_number, lactation_no, lactation_days, age (years), insemination_no, reproduction_status, day_production (kg/day), on_set_of_heat, time_away (HH:MM), heat_probability_max (0-100), optimum_insemination_moment, insemination_remarks, hours_since_heat. Sorted by heat probability (highest first). Use when the farmer asks about heat detection, insemination timing, or breeding activity.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.gt('heat_probability_max', 0).order('heat_probability_max', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the heat and insemination report.`;
      return `Error fetching heat and insemination report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently showing heat activity.";

    return formatResult(data, 'Heat & Insemination Report', !!animalNumber, HEAT_INSEM_FIELDS);
  }
};

// ─── Heat Probability Report ─────────────────────────────────────────────────

const HEAT_PROB_FIELDS = ['animal_number', 'group_number', 'lactation_no', 'lactation_days', 'reproduction_status', 'last_insemination', 'days_since_heat', 'on_set_of_heat', 'hours_since_heat', 'heat_probability_max', 'day_production', 'day_production_deviation', 'optimum_insemination_moment', 'health_remark', 'since_insemination'];

export const get_heat_probability_report = {
  definition: {
    type: "function",
    function: {
      name: "get_heat_probability_report",
      description: "Get cows ranked by heat probability with optimum insemination timing. Returns: animal_number, group_number, lactation_no, lactation_days, reproduction_status, last_insemination, days_since_heat, on_set_of_heat, hours_since_heat, heat_probability_max (0-100), day_production (kg/day), day_production_deviation, optimum_insemination_moment, health_remark, since_insemination (computed days). Sorted by probability (highest first). Use when the farmer asks which cows are ready for breeding or have the highest heat chance.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.gt('heat_probability_max', 0).order('heat_probability_max', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the heat probability report.`;
      return `Error fetching heat probability report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently showing heat probability.";

    // Calculate since_insemination for each cow
    const addInseminationDays = (cow: any) => {
      if (cow.last_insemination) {
        const lastDate = new Date(cow.last_insemination);
        if (!isNaN(lastDate.getTime())) {
          const diffMs = Date.now() - lastDate.getTime();
          cow.since_insemination = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }
      return cow;
    };

    const processed = Array.isArray(data) ? data.map(addInseminationDays) : addInseminationDays(data);
    return formatResult(processed, 'Heat Probability Report', !!animalNumber, HEAT_PROB_FIELDS);
  }
};

// ─── Calving Report ──────────────────────────────────────────────────────────

const CALVING_FIELDS = ['animal_number', 'robot', 'group_number', 'location', 'lactation_no', 'lactation_days', 'time_away', 'interval_exceeded', 'milk_yield_expected', 'day_production', 'failures', 'milk_frequency', 'days_pregnant', 'milkings'];

export const get_calving_report = {
  definition: {
    type: "function",
    function: {
      name: "get_calving_report",
      description: "Get cows near calving (>220 days pregnant) or in early lactation (<30 days). Returns: animal_number, robot, group_number, location, lactation_no, lactation_days, time_away (HH:MM), interval_exceeded (hours overdue), milk_yield_expected (kg), day_production (kg/day), failures, milk_frequency, days_pregnant, milkings. Filters to relevant cows only. Use when the farmer asks about upcoming calvings, fresh cows, or transition cows.",
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

    let query = buildQuery(orgId, animalNumber);
    if (!animalNumber) {
      query = query.or('days_pregnant.gt.220,lactation_days.lt.30');
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST116' && animalNumber) return `Cow ${animalNumber} not found in the calving report.`;
      return `Error fetching calving report: ${error.message}`;
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return "No cows currently near calving or in early lactation.";

    return formatResult(data, 'Calving Report', !!animalNumber, CALVING_FIELDS);
  }
};
