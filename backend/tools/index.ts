import * as infoTools from './info.tools';
import * as healthTools from './health.tools';
import * as metricsTools from './metrics.tools';
import * as reproductionTools from './reproduction.tools';
import * as notesTools from './notes.tools';
import * as conversationTools from './conversation.tools';
import * as reportsTools from './reports.tools';

/**
 * Registry of all AI tools, mapping tool names to their 
 * definition and implementation.
 */
export const tools: Record<string, any> = {
  ...infoTools,
  ...healthTools,
  ...metricsTools,
  ...reproductionTools,
  ...notesTools,
  ...conversationTools,
  ...reportsTools
};

/**
 * Returns an array of OpenAI tool definitions for the chat completion.
 */
export function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition);
}

/**
 * Executes a tool by name with the given arguments.
 */
export async function executeTool(name: string, args: any, context: any = {}) {
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool "${name}" not found.`);
  }
  return await tool.handler(args, context);
}

export default {
  tools,
  getToolDefinitions,
  executeTool
};
