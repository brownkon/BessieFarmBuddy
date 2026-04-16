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
          sessionId = part.value === 'null' || part.value === 'undefined' ? null : part.value;
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

      // Smart Session Recovery: If sessionId is null/missing, find last or create new
      if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
        console.log(`[Voice] Session ID missing for user ${user.id}, attempting recovery...`);
        
        const { data: latestSession } = await supabase
          .from('chat_sessions')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();

        if (latestSession) {
          sessionId = latestSession.id;
          console.log(`[Voice] Recovered existing session: ${sessionId}`);
        } else {
          const { data: newSession, error: createError } = await supabase
            .from('chat_sessions')
            .insert({ user_id: user.id, title: 'New Voice Chat' })
            .select()
            .single();
          
          if (createError) {
            console.error(`[Voice] Failed to auto-create session: ${createError.message}`);
            reply.raw.write(`data: ${JSON.stringify({ error: 'Could not create or find a chat session.' })}\n\n`);
            reply.raw.write('data: [DONE]\n\n');
            reply.raw.end();
            return;
          }
          sessionId = newSession.id;
          console.log(`[Voice] Auto-created new session: ${sessionId}`);
        }
      }

      // Auto-title the session on its first real message
      const { data: currentSession } = await supabase
        .from('chat_sessions')
        .select('title')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (currentSession && (currentSession.title === 'New Chat' || !currentSession.title)) {
        await supabase
          .from('chat_sessions')
          .update({ title: transcript.substring(0, 40) + (transcript.length > 40 ? '...' : '') })
          .eq('id', sessionId);
      }

      // Send the transcript chunk
      reply.raw.write(`data: ${JSON.stringify({ transcript })}\n\n`);

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
        if (chunk.toolCall && !toolsUsed.includes(chunk.toolCall)) toolsUsed.push(chunk.toolCall);
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
          if (error) fastify.log.error({ error: error.message }, 'Error saving voice chat');
          else fastify.log.info({ email: user.email }, 'Saved voice chat');
        });

        // Update session timestamp
        supabase.from('chat_sessions')
          .update({ updated_at: new Date() })
          .eq('id', sessionId)
          .then(({ error }) => {
            if (error) fastify.log.error({ error: error.message }, 'Error updating session timestamp');
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
