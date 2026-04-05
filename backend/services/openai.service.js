const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get a streaming response from GPT-4o-mini
 * @param {object} params
 * @param {string} params.text - User message
 * @param {Array} params.history - Optional previous chat history [{role, content}]
 * @param {string} params.systemMessage - Optional system prompt
 * @returns {Promise<AsyncGenerator<string>>}
 */
async function getChatStream({
  text,
  history = [],
  language = 'en',
  systemMessage = null
}) {
  const finalSystemMessage = systemMessage || `You are a helpful farmer AI named Bessie. 
      - Keep responses extremely concise (1-2 sentences max) when possible. 
      - NO follow-up questions like "How can I assist you?" or "Is there anything else?". 
      - If the user says "thank you", "stop", "bye", or indicates they are done, call the 'terminate_conversation' tool immediately.
      - IMPORTANT: NEVER mention the tool name "terminate_conversation" in your audible response.
      - Current language: ${language}. Always respond in ${language}.`;

  const messages = [
    { role: 'system', content: finalSystemMessage },
    ...history,
    { role: 'user', content: text }
  ];

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages,
    stream: true,
  });

  return (async function* () {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) yield content;
    }
  })();
}

/**
 * Transcribe only
 * @param {string} tempFilePath
 * @param {string} language
 * @param {object} fs
 * @returns {Promise<string>}
 */
async function transcribeAudio(tempFilePath, language, fs) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath),
    model: "whisper-1",
    language: language,
  });
  return transcription.text || "";
}

module.exports = {
  openai,
  getChatStream,
  transcribeAudio
};
