import 'dotenv/config';
import supabase from '../supabase';
import { openaiService } from '../openai/index';

/**
 * Script to generate a daily report for an organization.
 * Fetches all notes from the current day and uses an LLM to summarize them.
 */
export async function generateDailyReport(organizationId: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch notes recorded today for the given organization
    const { data: notes, error: notesError } = await (supabase as any)
      .from('farmer_notes')
      .select('content, animal_number, created_at, user_id')
      .eq('organization_id', organizationId)
      .gte('created_at', today.toISOString());

    if (notesError) throw notesError;

    if (!notes || notes.length === 0) {
      console.log('No notes found for today.');
      return;
    }

    // Prepare context for the LLM
    const notesText = notes.map((n: any) => 
      `- Note for cow ${n.animal_number || 'General'}: "${n.content}" (recorded at ${new Date(n.created_at).toLocaleTimeString()})`
    ).join('\n');

    const prompt = `You are an expert dairy farm assistant. Summarize the following notes recorded by the farmer today into a brief daily report. Highlight any actionable items or sick cows mentioned.\n\nNotes:\n${notesText}`;

    // Get summary from OpenAI
    const summary = await openaiService.generateCompletion(prompt);

    console.log(`\n=== Daily Report for Organization ${organizationId} ===`);
    console.log(summary);
    console.log('======================================================\n');
    
    // Future expansion: Save to a `daily_reports` table or email it.

  } catch (error: any) {
    console.error('Error generating daily report:', error.message);
  }
}

// Example Execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node daily-report.js <organization_id>');
  } else {
    generateDailyReport(args[0]).then(() => process.exit(0));
  }
}
