#!/usr/bin/env tsx
/**
 * CLI Tool Runner — Query any Bessie tool directly from the terminal.
 *
 * Usage:
 *   npx tsx scripts/run-tool.ts <tool_name> [--arg=value ...]
 *
 * Examples:
 *   npx tsx scripts/run-tool.ts get_health_alerts
 *   npx tsx scripts/run-tool.ts get_cow_info --animalNumber=250
 *   npx tsx scripts/run-tool.ts get_fetch_report --animalNumber=1089
 *   npx tsx scripts/run-tool.ts get_specific_metric --metric_name=day_production
 *   npx tsx scripts/run-tool.ts get_calving_report
 *   npx tsx scripts/run-tool.ts --list
 */
import 'dotenv/config';
import { tools, executeTool, getToolDefinitions } from '../tools/index';

async function main() {
  const rawArgs = process.argv.slice(2);

  // --list: Print all available tools and exit
  if (rawArgs.includes('--list')) {
    printToolList();
    process.exit(0);
  }

  const toolName = rawArgs[0];
  if (!toolName || toolName.startsWith('--')) {
    printUsage();
    process.exit(1);
  }

  if (!tools[toolName]) {
    console.error(`\n❌  Tool "${toolName}" not found.\n`);
    printToolList();
    process.exit(1);
  }

  // Parse --key=value args into an object
  const toolArgs = parseArgs(rawArgs.slice(1));

  console.log(`\n🔧  Running: ${toolName}`);
  if (Object.keys(toolArgs).length > 0) {
    console.log(`📎  Args:    ${JSON.stringify(toolArgs)}`);
  }
  console.log('─'.repeat(60));

  const startMs = Date.now();
  try {
    const result = await executeTool(toolName, toolArgs);
    const elapsed = Date.now() - startMs;

    console.log(JSON.stringify(result, null, 2));
    console.log('─'.repeat(60));
    console.log(`✅  Done in ${elapsed}ms\n`);
  } catch (err: any) {
    const elapsed = Date.now() - startMs;
    console.error(`\n❌  Error after ${elapsed}ms: ${err.message}\n`);
    process.exit(1);
  }
}

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const arg of args) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      result[match[1]] = match[2];
    } else {
      console.warn(`⚠️  Skipping unrecognized arg: "${arg}" (expected --key=value)`);
    }
  }
  return result;
}

function printUsage() {
  console.log(`
Usage:  npx tsx scripts/run-tool.ts <tool_name> [--arg=value ...]

Options:
  --list   Show all available tools

Examples:
  npx tsx scripts/run-tool.ts get_health_alerts
  npx tsx scripts/run-tool.ts get_cow_info --animalNumber=250
  npx tsx scripts/run-tool.ts get_specific_metric --metric_name=day_production
`);
}

function printToolList() {
  const defs = getToolDefinitions();
  console.log('\n📋  Available Tools:\n');
  for (const def of defs) {
    const fn = def.function;
    const params = Object.entries(fn.parameters.properties || {})
      .map(([name, schema]: [string, any]) => {
        const req = fn.parameters.required?.includes(name) ? ' (required)' : '';
        return `    --${name}  ${schema.description}${req}`;
      });
    console.log(`  ${fn.name}`);
    console.log(`    ${fn.description}`);
    if (params.length > 0) {
      console.log(`    Parameters:`);
      params.forEach(p => console.log(p));
    }
    console.log('');
  }
}

main();
