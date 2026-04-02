const openaiService = require('../services/openai.service');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

async function apiRoutes(fastify, options) {
  // Chat completion route
  fastify.post('/chat', async (request, reply) => {
    try {
      const { text } = request.body;
      if (!text) return reply.code(400).send({ error: 'Text input is required' });

      fastify.log.info(`[Bessie] Incoming text: "${text}"`);
      const response = await openaiService.getChatCompletion(text);
      fastify.log.info(`[Bessie] AI Output: "${response}"`);
      return { response };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Voice Chat (text transcript from frontend) route
  fastify.post('/voice-chat', async (request, reply) => {
    try {
      const { transcript } = request.body;
      if (!transcript) return reply.code(400).send({ error: 'Transcript input is required' });

      fastify.log.info(`[Bessie] Incoming voice transcript: "${transcript}"`);
      const response = await openaiService.getChatCompletion(transcript, 'You are a helpful farmer AI named Bessie. Keep responses extremely concise and helpful for a farmer working in the field.');
      fastify.log.info(`[Bessie] AI Output (voice): "${response}"`);
      return { summary: response };
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  // Whisper-based chat route
  fastify.post('/whisper-chat', async (request, reply) => {
    let tempFilePath = null;
    try {
      fastify.log.info(`[Bessie-Whisper] Starting multipart request processing...`);
      const parts = request.parts();
      let audioBuffer = null;
      let language = 'en';
      let filename = 'command.m4a';

      for await (const part of parts) {
        if (part.file) {
          filename = part.filename;
          audioBuffer = await part.toBuffer();
        } else if (part.fieldname === 'language') {
          language = part.value;
        }
      }

      if (!audioBuffer) {
        return { summary: "No audio data was received.", transcript: "" };
      }

      const tempDir = os.tmpdir();
      tempFilePath = path.join(tempDir, `bessie_voice_${Date.now()}_${filename}`);
      await fs.writeFile(tempFilePath, audioBuffer);

      fastify.log.info(`[Bessie] Transcribing audio in ${language} with Whisper...`);
      const result = await openaiService.processWhisperVoice(tempFilePath, language, fs);
      
      fastify.log.info(`[Bessie] AI Output (Whisper - ${language}): "${result.summary}" (exit: ${result.exit})`);
      return result;
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    } finally {
      if (tempFilePath && await fs.pathExists(tempFilePath)) {
        await fs.remove(tempFilePath);
      }
    }
  });
}

module.exports = apiRoutes;
