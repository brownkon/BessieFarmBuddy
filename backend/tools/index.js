const cowTools = require('./cow.tools');
const conversationTools = require('./conversation.tools');

/**
 * Registry of all AI tools, mapping tool names to their 
 * definition and implementation.
 */
const tools = {
  ...cowTools,
  ...conversationTools
};

/**
 * Returns an array of OpenAI tool definitions for the chat completion.
 */
function getToolDefinitions() {
  return Object.values(tools).map(t => t.definition);
}

/**
 * Executes a tool by name with the given arguments.
 */
async function executeTool(name, args) {
  const tool = tools[name];
  if (!tool) {
    throw new Error(`Tool "${name}" not found.`);
  }
  return await tool.handler(args);
}

module.exports = {
  tools,
  getToolDefinitions,
  executeTool
};
