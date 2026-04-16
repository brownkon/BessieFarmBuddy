import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates } from '../services/data-prep/utils';

export const record_note = {
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
  async handler({ note_content, animal_number }: { note_content: string, animal_number?: string }, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";
    if (!context.userId) return "User context not provided, cannot record note.";

    const orgId = await getUserOrganization(context.userId);
    if (!orgId) return "Organization not found for user.";

    const { error } = await (supabase as any)
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

export const get_recent_notes = {
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
  async handler({ animal_number, days_back = 1 }: { animal_number?: string, days_back?: number }, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;
    if (!orgId) return "Organization not found for user.";

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days_back);

    let query = (supabase as any).from('farmer_notes')
      .select('content, animal_number, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', dateLimit.toISOString())
      .order('created_at', { ascending: false });

    if (animal_number) query = query.eq('animal_number', animal_number.toString());

    const { data, error } = await query;
    if (error) return `Error retrieving notes: ${error.message}`;
    if (data.length === 0) return "No recent notes found.";

    // Automatically format all date strings (including created_at)
    return formatAllDates(data);
  }
};
