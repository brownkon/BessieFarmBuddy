/**
 * Utility functions for the Bessie CLI Chat tool.
 * Separated from the main script for testability and SRP.
 */

// ─── Types ──────────────────────────────────────────────────────────────────
export interface CliOptions {
  language: string;
  single: string | null;
  noColor: boolean;
  verbose: boolean;
}

// ─── Argument Parsing ───────────────────────────────────────────────────────
/**
 * Parse CLI arguments into structured options.
 * Supports: --lang=<code>, --single "<text>", --no-color, --verbose
 */
export function parseCliArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    language: 'en',
    single: null,
    noColor: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--lang=')) {
      options.language = arg.split('=')[1] || 'en';
    } else if (arg === '--single' && i + 1 < args.length) {
      options.single = args[++i];
    } else if (arg === '--no-color') {
      options.noColor = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    }
  }

  return options;
}

// ─── Formatting ─────────────────────────────────────────────────────────────
const TOOL_EMOJI: Record<string, string> = {
  get_cow_info: '🐄',
  get_health_alerts: '🏥',
  get_specific_metric: '📊',
  get_calving_report: '🍼',
  get_fetch_report: '📋',
  get_reproduction_summary: '🧬',
  get_notes: '📝',
  terminate_conversation: '👋',
};

/**
 * Format a tool call notification for verbose mode.
 */
export function formatToolCall(toolName: string): string {
  const emoji = TOOL_EMOJI[toolName] || '🔧';
  return `\x1b[90m  ${emoji} [tool: ${toolName}]\x1b[0m\n`;
}

/**
 * Format timing information for verbose mode.
 */
export function formatTiming(elapsedMs: number, toolsUsed: string[]): string {
  const parts: string[] = [];
  parts.push(`\x1b[90m  ⏱  ${elapsedMs}ms`);
  if (toolsUsed.length > 0) {
    parts.push(` | tools: ${toolsUsed.join(', ')}`);
  }
  parts.push(`\x1b[0m\n`);
  return parts.join('');
}
