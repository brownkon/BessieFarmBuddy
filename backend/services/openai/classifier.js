const { getToolDefinitions } = require('../../tools');
const groqService = require('../groq');
let cachedToolList = null;

/**
 * Classifier module handles routing the user request to determine if a tool is needed.
 */
async function classifyRequest(openai, text, history) {
  const start = Date.now();
  // Fast-track: phrase-based matching (no LLM needed for clear closures/greetings)
  const lowerText = text.toLowerCase().trim().replace(/[!.?]/g, '');
  const closurePhrases = [
    'thanks', 'thank you', 'bye', 'goodbye', 'see ya', 'see you later',
    'stop listening', 'stop talking', 'that\'s all', 'that is all',
    'i\'m done', 'i am done', 'we\'re done', 'we are done',
    'leave me alone', 'go away', 'end conversation', 'end chat',
    'talk later', 'talk soon', 'catch you later', 'good night', 'good day',
  ];
  const greetingPhrases = ['hi', 'hello', 'hey', 'yo', 'sup', 'howdy', 'good morning'];

  if (closurePhrases.some(phrase => lowerText.includes(phrase))) {
    return { should_call_tool: true, tool_name: "terminate_conversation", arguments: null, confidence: 1.0 };
  }

  if (greetingPhrases.some(phrase => lowerText === phrase)) {
    return { should_call_tool: false, tool_name: null, arguments: null, confidence: 1.0 };
  }

  // Generate tool list once and cache it
  if (!cachedToolList) {
    const toolDefs = getToolDefinitions();
    cachedToolList = toolDefs.map(t => {
      const params = Object.entries(t.function.parameters.properties || {})
        .map(([name, schema]) => `${name}: ${schema.description}`)
        .join(', ');
      return `- ${t.function.name}: ${t.function.description} (${params})`;
    }).join('\n');
  }

  const routerPrompt = `You are a binary router. 
Determine ONLY if the user's request REQUIRES one of the specific tools below to fetch farm data.

AVAILABLE TOOLS:
${cachedToolList}

RULES:
1. If the request is a general question, joke, or story that does not need REAL-TIME farm data, set "should_call_tool" to false.
2. DO NOT ANSWER THE QUESTION. DO NOT ENCLOSE THE ANSWER IN ARGUMENTS.
3. If no tool matches, set "should_call_tool" to false.

Respond ONLY with valid JSON:
{ 
  "should_call_tool": boolean, 
  "tool_name": string | null, 
  "arguments": object | null, 
  "confidence": 0-1 
}`;

  try {
    const response = await groqService.chatCompletion({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: routerPrompt },
        ...history.slice(-2),
        { role: 'user', content: text }
      ],
      response_format: 'json_object'
    });

    const result = JSON.parse(response);
    console.log(`[Classifier] Groq latency: ${Date.now() - start}ms | Result: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    console.error(`[Classifier] Groq Routing error:`, err);
    return { should_call_tool: false, tool_name: null, arguments: null, confidence: 0 };
  }
}

module.exports = { classifyRequest };
