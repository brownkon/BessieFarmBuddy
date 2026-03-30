const fastify = require('fastify')({ logger: true });
const OpenAI = require('openai');
require('dotenv').config();

// Register CORS for React Native/Frontend access
fastify.register(require('@fastify/cors'), {
  origin: true, // Allow all origins (standard for dev)
});

// Added root GET and /health for easy health checking
fastify.get('/', async () => {
  return { status: 'Bessie Backend is running' };
});

fastify.get('/health', async () => {
  return { status: 'ok' };
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

fastify.post('/api/chat', async (request, reply) => {
  try {
    const { text } = request.body;
    
    if (!text) {
      return reply.code(400).send({ error: 'Text input is required' });
    }

    fastify.log.info(`[Bessie] Incoming text: "${text}"`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful farmer AI named Bessie. Keep responses concise and practical for a farmer.' },
        { role: 'user', content: text }
      ],
    });

    const aiResponse = response.choices[0].message.content;
    fastify.log.info(`[Bessie] AI Output: "${aiResponse}"`);

    return { response: aiResponse };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

fastify.post('/api/voice-chat', async (request, reply) => {
  try {
    const { transcript } = request.body;
    
    if (!transcript) {
      return reply.code(400).send({ error: 'Transcript input is required' });
    }

    fastify.log.info(`[Bessie] Incoming voice transcript: "${transcript}"`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful farmer AI named Bessie. Keep responses extremely concise and helpful for a farmer working in the field.' },
        { role: 'user', content: transcript }
      ],
    });

    const aiResponse = response.choices[0].message.content;
    fastify.log.info(`[Bessie] AI Output (voice): "${aiResponse}"`);

    // Return 'summary' to match the frontend snippet's expectation
    return { summary: aiResponse };
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    fastify.log.info(`server listening on ${fastify.server.address().port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = fastify;
