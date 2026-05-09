#!/usr/bin/env tsx
/**
 * Bessie CLI Chat — Talk to Bessie directly from your terminal.
 * Bypasses the HTTP server and auth layer, calling the AI service directly.
 *
 * Usage:
 *   npm run chat
 *   npm run chat -- --lang=es
 *   npm run chat -- --single "How are my cows doing?"
 *
 * Options:
 *   --lang=<code>      Set response language (default: en)
 *   --single "<text>"   Send a single prompt and exit (no REPL)
 *   --no-color          Disable colored output
 *   --verbose           Show tool calls and timing info
 */
import 'dotenv/config';
import * as readline from 'readline';
import { openaiService } from '../services/openai';
import { parseCliArgs, formatToolCall, formatTiming } from './chat-cli-utils';

// ─── Types ──────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CliOptions {
  language: string;
  single: string | null;
  noColor: boolean;
  verbose: boolean;
}

// ─── Styling ────────────────────────────────────────────────────────────────
const color = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function styled(text: string, ...styles: string[]): string {
  return styles.join('') + text + color.reset;
}

// ─── Core Chat Function ────────────────────────────────────────────────────
export async function sendMessage(
  text: string,
  history: ChatMessage[],
  options: CliOptions
): Promise<{ response: string; toolsUsed: string[] }> {
  const startMs = Date.now();

  const stream = await openaiService.getChatStream({
    text,
    history,
    language: options.language,
    context: { userId: 'cli-user' },
  });

  let fullResponse = '';
  const toolsUsed: string[] = [];

  // Stream tokens to stdout in real-time
  for await (const chunk of stream as AsyncIterable<any>) {
    if (chunk.toolCall && !toolsUsed.includes(chunk.toolCall)) {
      toolsUsed.push(chunk.toolCall);
      if (options.verbose && !options.noColor) {
        process.stdout.write(formatToolCall(chunk.toolCall));
      }
    }

    if (chunk.content) {
      fullResponse += chunk.content;
      if (!options.noColor) {
        process.stdout.write(styled(chunk.content, color.cyan));
      } else {
        process.stdout.write(chunk.content);
      }
    }

    if (chunk.terminate) {
      toolsUsed.push('terminate_conversation');
    }
  }

  process.stdout.write('\n');

  if (options.verbose) {
    process.stdout.write(formatTiming(Date.now() - startMs, toolsUsed));
  }

  return { response: fullResponse, toolsUsed };
}

// ─── Single-shot Mode ───────────────────────────────────────────────────────
async function runSingle(text: string, options: CliOptions): Promise<void> {
  if (!options.noColor) {
    console.log(styled(`\n🐄  You: ${text}`, color.bold, color.green));
    process.stdout.write(styled('🤖  Bessie: ', color.bold, color.magenta));
  } else {
    console.log(`\nYou: ${text}`);
    process.stdout.write('Bessie: ');
  }

  await sendMessage(text, [], options);
}

// ─── Interactive REPL ───────────────────────────────────────────────────────
async function runRepl(options: CliOptions): Promise<void> {
  const history: ChatMessage[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  if (!options.noColor) {
    console.log(styled('\n╔══════════════════════════════════════════╗', color.magenta));
    console.log(styled('║        🐄  Bessie CLI Chat  🐄          ║', color.magenta, color.bold));
    console.log(styled('╚══════════════════════════════════════════╝', color.magenta));
    console.log(styled('  Type your message and press Enter.', color.dim));
    console.log(styled('  Commands: /clear, /history, /quit\n', color.dim));
  } else {
    console.log('\n--- Bessie CLI Chat ---');
    console.log('Type your message and press Enter.');
    console.log('Commands: /clear, /history, /quit\n');
  }

  const prompt = () => {
    const prefix = options.noColor ? 'You > ' : styled('You > ', color.bold, color.green);
    rl.question(prefix, async (input) => {
      const text = input.trim();

      if (!text) {
        prompt();
        return;
      }

      // Slash commands
      if (text.startsWith('/')) {
        handleSlashCommand(text, history, options);
        prompt();
        return;
      }

      if (!options.noColor) {
        process.stdout.write(styled('Bessie > ', color.bold, color.magenta));
      } else {
        process.stdout.write('Bessie > ');
      }

      try {
        const { response, toolsUsed } = await sendMessage(text, history, options);

        // Maintain conversation history (keep last 10 turns)
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: response });
        if (history.length > 20) history.splice(0, 2);

        // Exit on termination
        if (toolsUsed.includes('terminate_conversation')) {
          rl.close();
          process.exit(0);
        }
      } catch (err: any) {
        console.error(styled(`\n❌  Error: ${err.message}`, color.yellow));
      }

      prompt();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    console.log(styled('\n👋  See ya later!', color.magenta));
    process.exit(0);
  });

  prompt();
}

// ─── Slash Commands ─────────────────────────────────────────────────────────
function handleSlashCommand(cmd: string, history: ChatMessage[], options: CliOptions): void {
  switch (cmd.toLowerCase()) {
    case '/quit':
    case '/exit':
    case '/q':
      console.log(styled('\n👋  See ya later!', options.noColor ? '' : color.magenta));
      process.exit(0);

    case '/clear':
      history.length = 0;
      console.log(styled('🧹  History cleared.\n', options.noColor ? '' : color.dim));
      break;

    case '/history':
      if (history.length === 0) {
        console.log(styled('  (empty)\n', options.noColor ? '' : color.dim));
      } else {
        for (const msg of history) {
          const label = msg.role === 'user' ? 'You' : 'Bessie';
          const style = msg.role === 'user' ? color.green : color.cyan;
          console.log(styled(`  ${label}: ${msg.content.substring(0, 80)}`, options.noColor ? '' : style));
        }
        console.log('');
      }
      break;

    default:
      console.log(styled(`  Unknown command: ${cmd}. Try /clear, /history, /quit\n`, options.noColor ? '' : color.yellow));
  }
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.noColor) {
    // Disable all color codes
    Object.keys(color).forEach(k => (color as any)[k] = '');
  }

  if (options.single) {
    await runSingle(options.single, options);
  } else {
    await runRepl(options);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
