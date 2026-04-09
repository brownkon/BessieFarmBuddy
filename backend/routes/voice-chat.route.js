const groqService = require('../services/groq');
const openaiService = require('../services/openai');
const { authenticate } = require('../middleware/auth.middleware');
const supabase = require('../services/supabase');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

async function voiceChatRoutes(fastify, options) {
  // Unified Voice Chat (Transcription + Streaming) - Protected
  fastify.post('/voice-chat', { preHandler: [authenticate] }, async (request, reply) => {
    let tempFilePath = null;
    const user = request.user;
    try {
      const parts = request.parts();
      let audioBuffer = null;
      let language = 'en';
      let history = [];
      let location = null;
      let sessionId = null;

      for await (const part of parts) {
        if (part.file) {
          audioBuffer = await part.toBuffer();
        } else if (part.fieldname === 'language') {
          language = part.value;
        } else if (part.fieldname === 'history') {
          try { history = JSON.parse(part.value); } catch (e) { }
        } else if (part.fieldname === 'location') {
          try { location = JSON.parse(part.value); } catch (e) { }
        } else if (part.fieldname === 'sessionId') {
          sessionId = part.value;
        }
      }

      if (!audioBuffer) return reply.code(400).send({ error: 'No audio data' });

      const tempDir = os.tmpdir();
      tempFilePath = path.join(tempDir, `bessie_v_${Date.now()}.m4a`);
      await fs.writeFile(tempFilePath, audioBuffer);

      const transcribeStart = Date.now();
      const transcript = await groqService.transcribeAudio(tempFilePath, language, fs);
      console.log(`[Timer] Transcription took: ${Date.now() - transcribeStart}ms`);

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');

      if (!transcript) {
        reply.raw.write(`data: ${JSON.stringify({ content: "I couldn't hear anything." })}\n\n`);
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
        return;
      }

      // If no sessionId, create a new session
      let isNewSession = false;
      if (!sessionId) {
        isNewSession = true;
        const { data: newSession, error: sessError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            title: transcript.substring(0, 40) + (transcript.length > 40 ? '...' : '')
          })
          .select()
          .single();

        if (sessError) {
          fastify.log.error(`[Supabase] Error creating session: ${sessError.message}`);
          return reply.code(500).send({ error: 'Failed to create chat session' });
        }
        sessionId = newSession.id;
      }

      // 1. Send the transcript chunk and sessionId
      const initialChunk = { transcript };
      if (isNewSession) initialChunk.sessionId = sessionId;
      reply.raw.write(`data: ${JSON.stringify(initialChunk)}\n\n`);

      const aiStart = Date.now();
      const stream = await openaiService.getChatStream({
        text: transcript,
        history,
        language,
        context: { userId: user.id }
      });
      console.log(`[Timer] getChatStream started in: ${Date.now() - aiStart}ms`);

      let fullResponse = "";
      const toolsUsed = [];

      for await (const chunk of stream) {
        if (chunk.content) fullResponse += chunk.content;
        if (chunk.terminate) toolsUsed.push('terminate_conversation');
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();

      // Async Log to Supabase (Background)
      setImmediate(() => {
        // Save message
        supabase.from('chats').insert({
          session_id: sessionId,
          user_id: user.id,
          prompt: transcript,
          response: fullResponse,
          gps_coordinates: location || null,
          tools_used: toolsUsed
        }).then(({ error }) => {
          if (error) fastify.log.error(`[Supabase] Error saving voice chat: ${error.message}`);
          else fastify.log.info(`[Supabase] Saved voice chat for ${user.email}`);
        });

        // Update session timestamp
        supabase.from('chat_sessions')
          .update({ updated_at: new Date() })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (error) fastify.log.error(`[Supabase] Error updating session timestamp: ${error.message}`);
          });
      });

    } catch (error) {
      fastify.log.error(error);
      if (!reply.raw.writableEnded) reply.raw.end();
    } finally {
      if (tempFilePath && await fs.pathExists(tempFilePath)) await fs.remove(tempFilePath);
    }
  });
}

module.exports = voiceChatRoutes;
