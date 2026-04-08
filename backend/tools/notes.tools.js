const supabase = require('../services/supabase');
const { getUserOrganization } = require('./utils');

const recordNote = {
  definition: {
    type: "function",
    function: {
      name: "record_note",
      description: "Record a note or discussion point for the farmer to review later.",
      parameters: {
        type: "object",
        properties: {
          note_content: { type: "string", description: "The content of the note." },
          animal_number: { type: "string", description: "Optional cow ID if the note is specific to one cow." }
        },
        required: ["note_content"]
      }
    }
  },
  async handler({ note_content, animal_number }, context = {}) {
    if (!supabase) return "Supabase not initialized.";
    if (!context.userId) return "User context not provided, cannot record note.";
    
    const orgId = await getUserOrganization(context.userId);
    if (!orgId) return "Organization not found for user.";

    const { error } = await supabase
      .from('farmer_notes')
      .insert([
        { 
          user_id: context.userId, 
          organization_id: orgId, 
          content: note_content,
          animal_number: animal_number || null
        }
      ]);

    if (error) return `Error recording note: ${error.message}`;
    return "Note recorded successfully.";
  }
};

const getRecentNotes = {
  definition: {
    type: "function",
    function: {
      name: "get_recent_notes",
      description: "Get recent notes recorded by the farmer.",
      parameters: {
        type: "object",
        properties: {
          animal_number: { type: "string", description: "Optional cow ID to filter notes." },
          days_back: { type: "integer", description: "Number of days back to look. Defaults to 1 (today)." }
        }
      }
    }
  },
  async handler({ animal_number, days_back = 1 }, context = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;
    if (!orgId) return "Organization not found for user.";
    
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days_back);
    
    let query = supabase.from('farmer_notes')
      .select('content, animal_number, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', dateLimit.toISOString())
      .order('created_at', { ascending: false });
      
    if (animal_number) query = query.eq('animal_number', animal_number.toString());

    const { data, error } = await query;
    if (error) return `Error retrieving notes: ${error.message}`;
    if (data.length === 0) return "No recent notes found.";
    return data;
  }
};

module.exports = {
  record_note: recordNote,
  get_recent_notes: getRecentNotes
};
