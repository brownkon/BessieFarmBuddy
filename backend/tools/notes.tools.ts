import supabase from '../services/supabase';
import { getUserOrganization, formatAllDates, stripNulls } from '../services/data-prep/utils';

export const record_note = {
  definition: {
    type: "function",
    function: {
      name: "record_note",
      description: "Record a note or discussion point for the farmer to review later. Returns confirmation with the saved content. Use when the farmer asks to save, record, or remember something.",
      parameters: {
        type: "object",
        properties: {
          note_content: { type: "string", description: "The content of the note to save." },
          animal_number: { type: "string", description: "Optional cow number if the note is specific to one cow." }
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

    const { data, error } = await (supabase as any)
      .from('farmer_notes')
      .insert([
        {
          user_id: context.userId,
          organization_id: orgId,
          content: note_content,
          animal_number: animal_number || null
        }
      ])
      .select('content, animal_number, created_at')
      .single();

    if (error) return `Error recording note: ${error.message}`;
    return {
      status: "saved",
      content: data?.content || note_content,
      animal_number: animal_number || null,
      saved_at: data?.created_at || new Date().toISOString()
    };
  }
};

export const get_recent_notes = {
  definition: {
    type: "function",
    function: {
      name: "get_recent_notes",
      description: "Get recent notes recorded by the farmer. Defaults to the last 7 days, limited to 20 results. Can filter by cow number. Use when the farmer asks to see their notes, reminders, or past discussions.",
      parameters: {
        type: "object",
        properties: {
          animal_number: { type: "string", description: "Optional cow number to filter notes for a specific cow." },
          days_back: { type: "integer", description: "Number of days back to search. Defaults to 7." }
        }
      }
    }
  },
  async handler({ animal_number, days_back = 7 }: { animal_number?: string, days_back?: number }, context: any = {}) {
    if (!supabase) return "Supabase not initialized.";
    const orgId = context.userId ? await getUserOrganization(context.userId) : null;
    if (!orgId) return "Organization not found for user.";

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days_back);

    let query = (supabase as any).from('farmer_notes')
      .select('content, animal_number, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', dateLimit.toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    if (animal_number) query = query.eq('animal_number', animal_number.toString());

    const { data, error } = await query;
    if (error) return `Error retrieving notes: ${error.message}`;
    if (!data || data.length === 0) return `No notes found in the last ${days_back} days.`;

    return stripNulls(formatAllDates(data));
  }
};
