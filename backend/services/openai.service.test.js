const test = require('node:test');
const assert = require('node:assert');
process.env.OPENAI_API_KEY = 'dummy_key';
const openaiService = require('./openai.service');

// Mock OpenAI SDK
const mockOpenAI = {
  chat: {
    completions: {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Thinking ' } }] };
          yield { choices: [{ delta: { content: 'with ' } }] };
          yield { choices: [{ delta: { content: 'GPT-5.4 ' } }] };
          yield { choices: [{ delta: { content: 'mini.' } }] };
        },
      }),
    },
  },
};

// Override the openai instance in the service
openaiService.openai = mockOpenAI;

test('getChatStream yields content chunks from OpenAI', async (t) => {
  const stream = await openaiService.getChatStream({ text: 'Tell me about GPT-5' });
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  assert.deepStrictEqual(chunks, ['Thinking ', 'with ', 'GPT-5.4 ', 'mini.']);
});
