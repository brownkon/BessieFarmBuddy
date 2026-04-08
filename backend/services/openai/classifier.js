const { getToolDefinitions } = require('../../tools');

/**
 * Classifier module handles routing the user request to determine if a tool is needed.
 */
async function classifyRequest(openai, text, history) {
  const routerPrompt = `You are a cost-efficient router. Determine if the user's request REQUIRES a tool call to fulfill.
  Tools available: ${getToolDefinitions().map(t => t.function.name).join(', ')}.
  Return ONLY JSON: { "should_call_tool": boolean, "tool_name": string | null, "confidence": 0-1 }`;

  const response = await openai.chat.completions.create({
    model: 'gpt-5-nano',
    messages: [
      { role: 'system', content: routerPrompt },
      ...history.slice(-2), // Only last 2 turns for context
      { role: 'user', content: text }
    ],
    response_format: { type: 'json_object' }
  });

  try {
    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    return { should_call_tool: false, tool_name: null, confidence: 0 };
  }
}

module.exports = { classifyRequest };
