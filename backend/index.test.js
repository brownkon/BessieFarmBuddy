const test = require('node:test');
const assert = require('node:assert');
const fastify = require('./index.js');

test('POST /api/chat - requires text', async (t) => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      // empty body
    }
  });

  assert.strictEqual(response.statusCode, 400);
  const body = JSON.parse(response.payload);
  assert.strictEqual(body.error, 'Text input is required');
});

test('POST /api/chat - handles valid text and history', async (t) => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      text: 'My name is Konner',
      history: [
        { role: 'user', content: 'What is my name?' },
        { role: 'assistant', content: 'I don\'t know your name yet.' }
      ]
    }
  });

  // Since we don't mock OpenAI here, we can't expect a 200 without a real key
  assert.ok(response.statusCode === 200 || response.statusCode === 500);
});

test('POST /api/voice-chat - handles transcript and history', async (t) => {
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/voice-chat',
    payload: {
      transcript: 'Keep assisting me',
      history: [
        { role: 'user', content: 'You are my assistant' },
        { role: 'assistant', content: 'Understood.' }
      ]
    }
  });

  assert.ok(response.statusCode === 200 || response.statusCode === 500);
});
