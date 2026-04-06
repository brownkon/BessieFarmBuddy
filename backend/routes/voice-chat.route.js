const groqService = require('../services/groq.service');
const openaiService = require('../services/openai.service');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

async function voiceChatRoutes(fastify, options) {
  // Unified Voice Chat (Transcription + Streaming)
  fastify.post('/voice-chat', async (request, reply) => {
    let tempFilePath = null;
    try {
      const parts = request.parts();
      let audioBuffer = null;
      let language = 'en';
      let history = [];

      for await (const part of parts) {
        if (part.file) {
          audioBuffer = await part.toBuffer();
        } else if (part.fieldname === 'language') {
          language = part.value;
        } else if (part.fieldname === 'history') {
          try { history = JSON.parse(part.value); } catch (e) {}
        }
      }

      if (!audioBuffer) return reply.code(400).send({ error: 'No audio data' });

      const tempDir = os.tmpdir();
      tempFilePath = path.join(tempDir, `bessie_v_${Date.now()}.m4a`);
      await fs.writeFile(tempFilePath, audioBuffer);

      const transcript = await groqService.transcribeAudio(tempFilePath, language, fs);
      
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      
      if (!transcript) {
        reply.raw.write(`data: ${JSON.stringify({ content: "I couldn't hear anything." })}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return;
      }

      // 1. Send the transcript chunk
      reply.raw.write(`data: ${JSON.stringify({ transcript })}\n\n`);

      // 2. Begin streaming LLM using OpenAI
      const stream = await openaiService.getChatStream({ 
        text: transcript, 
        history,
        language
      });

      for await (const chunk of stream) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
    } catch (error) {
      fastify.log.error(error);
      if (!reply.raw.writableEnded) reply.raw.end();
    } finally {
      if (tempFilePath && await fs.pathExists(tempFilePath)) await fs.remove(tempFilePath);
    }
  });
}

module.exports = voiceChatRoutes;
