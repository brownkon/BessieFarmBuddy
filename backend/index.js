const fastify = require('fastify')({
  logger: true,
  bodyLimit: 30 * 1024 * 1024 // 30MB
});
const OpenAI = require('openai');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
require('dotenv').config();

// Register CORS for React Native/Frontend access
fastify.register(require('@fastify/cors'), {
  origin: true, // Allow all origins (standard for dev)
});

// Global hook for connection debugging
fastify.addHook('onRequest', async (request, reply) => {
  console.log(`[Backend-DEBUG] Incoming: ${request.method} ${request.url} from ${request.ip}`);
});

// Register Multipart for audio file uploads
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB (Whisper's limit)
  },
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

// NEW: Whisper-based chat
fastify.post('/api/whisper-chat', {
  preHandler: async (request, reply) => {
    fastify.log.info(`[Bessie-DEBUG] Content-Length: ${request.headers['content-length']}`);
    fastify.log.info(`[Bessie-DEBUG] Content-Type: ${request.headers['content-type']}`);
  }
}, async (request, reply) => {
  let tempFilePath = null;
  try {
    fastify.log.info(`[Bessie-Whisper] Starting multipart request processing...`);
    console.log(`[Backend] [Bessie-Whisper] Starting multipart request processing...`);
    const parts = request.parts();
    let audioBuffer = null;
    let language = 'en'; // Default
    let filename = 'command.m4a';

    for await (const part of parts) {
      if (part.file) {
        fastify.log.info(`[Bessie-Whisper] Received file: ${part.filename}`);
        console.log(`[Backend] [Bessie-Whisper] Received file: ${part.filename}`);
        filename = part.filename;
        try {
          fastify.log.info(`[Bessie-Whisper] Consuming file stream to buffer...`);
          audioBuffer = await part.toBuffer();
          fastify.log.info(`[Bessie-Whisper] File stream consumed. Size: ${audioBuffer.length} bytes`);
        } catch (err) {
          fastify.log.error(`[Bessie-Whisper] Error consuming file stream: ${err.message}`);
          throw err;
        }
      } else {
        if (part.fieldname === 'language') {
          language = part.value;
          fastify.log.info(`[Bessie-Whisper] Received language field: ${language}`);
        }
      }
    }

    if (!audioBuffer) {
      fastify.log.error(`[Bessie-Whisper] No audio file part found in request.`);
      return { summary: "No audio data was received.", transcript: "" };
    }

    // Save to temp file
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `bessie_voice_${Date.now()}_${filename}`);
    await fs.writeFile(tempFilePath, audioBuffer);

    fastify.log.info(`[Bessie] Transcribing audio in ${language} with Whisper...`);
    console.log(`[Backend] [Bessie] Transcribing audio in ${language} with Whisper...`);

    // Call OpenAI Whisper API
    try {
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-1",
        language: language,
      });

      const transcript = transcription.text;
      fastify.log.info(`[Bessie] Whisper Transcript (${language}): "${transcript}"`);
      console.log(`[Backend] [Bessie] Whisper Transcript (${language}): "${transcript}"`);

      if (!transcript || transcript.trim().length === 0) {
        return { summary: "I couldn't hear anything. Could you repeat that?" };
      }

      // LOCAL EXIT DETECTION: Save LLM credits if it's just a goodbye/thanks
      const EXIT_PHRASES = ['thank you', 'stop', 'bye', 'goodbye', 'thanks', 'dismissed', 'stop dialogue', 'stop talking', 'cancel', 'finished', 'done'];
      const lowerTranscript = transcript.toLowerCase().trim().replace(/[.,!?]+$/, '');
      
      if (EXIT_PHRASES.includes(lowerTranscript)) {
        const exitResponse = lowerTranscript.includes('thank') ? "You're welcome! Talk soon." : "Goodbye.";
        fastify.log.info(`[Bessie] Local Exit detected: "${lowerTranscript}". Skipping LLM.`);
        return { summary: exitResponse, transcript, exit: true };
      }

      // Process with LLM using tools for conversation control
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a helpful farmer AI named Bessie. 
            - Keep responses extremely concise (1-2 sentences max) when possible. 
            - NO follow-up questions like "How can I assist you?" or "Is there anything else?". 
            - If the user says "thank you", "stop", "bye", or indicates they are done, call the 'terminate_conversation' tool immediately.
            - Current language: ${language}. Always respond in ${language}.`
          },
          { role: 'user', content: transcript }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'terminate_conversation',
              description: 'Ends the current voice interaction because the user is finished or said goodbye.',
              parameters: { type: 'object', properties: {} }
            }
          }
        ],
        tool_choice: 'auto'
      });

      const message = response.choices[0].message;
      let aiResponse = message.content || "";
      let shouldExit = false;

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCall = message.tool_calls.find(tc => tc.function.name === 'terminate_conversation');
        if (toolCall) {
          shouldExit = true;
          if (!aiResponse) {
            aiResponse = transcript.toLowerCase().includes('thank') ? "You're welcome! Talk soon." : "Goodbye.";
          }
        }
      }

      fastify.log.info(`[Bessie] AI Output (Whisper - ${language}): "${aiResponse}" (exit: ${shouldExit})`);
      console.log(`[Backend] [Bessie] AI Output (Whisper - ${language}): "${aiResponse}" (exit: ${shouldExit})`);

      return { summary: aiResponse, transcript, exit: shouldExit };
    } catch (openAiErr) {
      fastify.log.error(`[Bessie-OpenAI] Error: ${openAiErr.message}`);
      console.error(`[Backend] [Bessie-OpenAI] Error:`, openAiErr);
      throw openAiErr;
    }
  } catch (error) {
    fastify.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  } finally {
    // Cleanup temp file
    if (tempFilePath && await fs.pathExists(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
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