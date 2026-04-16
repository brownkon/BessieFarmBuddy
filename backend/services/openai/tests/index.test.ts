const test = require('node:test');
const assert = require('node:assert');
const { classifyRequest } = require('../classifier');
const { streamResponse } = require('../orchestrator');

// Mock OpenAI SDK Client
const mockOpenAI = {
  chat: {
    completions: {
      create: async (params) => {
        // Mocking Router Classification
        if (params.model === 'gpt-5-nano') {
          return {
            choices: [{
              message: { content: JSON.stringify({ should_call_tool: true, tool_name: 'get_cow_info', confidence: 0.9 }) }
            }]
          };
        }
        
        // Mocking Final Stream
        if (params.stream) {
          async function* generator() {
            yield { choices: [{ delta: { content: "Cow 77 is doing great!" }, finish_reason: null }] };
            yield { choices: [{ delta: { content: "" }, finish_reason: 'stop' }] };
          }
          return generator();
        }

        return { choices: [{ message: { content: "General response" } }] };
      }
    }
  }
};

test('OpenAI Classifier: returns valid decision', async (t) => {
  const groqService = require('../../groq');
  const originalChat = groqService.chatCompletion;
  groqService.chatCompletion = async () => JSON.stringify({ should_call_tool: true, tool_name: 'get_cow_info', confidence: 0.9 });
  
  try {
    const decision = await classifyRequest(mockOpenAI, 'How is cow 77?', []);
    assert.strictEqual(decision.should_call_tool, true);
    assert.strictEqual(decision.tool_name, 'get_cow_info');
    assert.strictEqual(decision.confidence, 0.9);
  } finally {
    groqService.chatCompletion = originalChat;
  }
});

test('OpenAI Orchestrator: handle string response', async (t) => {
  const stream = await streamResponse({
      client: mockOpenAI,
      messages: [{ role: 'user', content: 'Hello' }],
      needsTool: false
  });
  
  let result = "";
  for await (const chunk of stream) {
    if (chunk.content) result += chunk.content;
  }
  
  assert.ok(result.includes('Cow 77'), 'Should contain model response');
});
