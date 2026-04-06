const test = require('node:test');
const assert = require('node:assert');
process.env.GROQ_API_KEY = 'dummy_key';
const groqService = require('./groq.service');

// Mock Groq SDK
const mockGroq = {
  audio: {
    transcriptions: {
      create: async () => ({ text: 'Hello, world!' }),
    },
  }
};

// Override the groq instance in the service
groqService.groq = mockGroq;

test('transcribeAudio returns transcribed text', async (t) => {
  const mockFs = {
    createReadStream: () => 'mockStream',
  };
  const text = await groqService.transcribeAudio('dummyPath.m4a', 'en', mockFs);
  assert.strictEqual(text, 'Hello, world!');
});
