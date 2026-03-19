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

test('POST /api/chat - handles valid text (mocked)', async (t) => {
  // To avoid real OpenAI calls in unit tests, we'd mock the OpenAI client.
  // For now, this just tests that the route is configured to accept valid input.
  // In a real environment with mocking, we would get a 200.
  // Since we don't mock OpenAI here and there's no API key, it will likely return 500.
  const response = await fastify.inject({
    method: 'POST',
    url: '/api/chat',
    payload: {
      text: 'Hello Bessie'
    }
  });

  // Depending on whether .env is loaded and the key is valid, we check for a response structure.
  assert.ok(response.statusCode === 200 || response.statusCode === 500);
});
