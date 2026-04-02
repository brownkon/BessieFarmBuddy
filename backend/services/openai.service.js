const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Get response from GPT-4o-mini
 * @param {string} text - User message
 * @param {string} systemMessage - Optional system prompt
 * @returns {Promise<string>}
 */
async function getChatCompletion(text, systemMessage = 'You are a helpful farmer AI named Bessie. Keep responses concise and practical for a farmer.') {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: text }
    ],
  });
  return response.choices[0].message.content;
}

/**
 * Transcribe audio and get response based on transcript
 * @param {string} tempFilePath - Path to temporary audio file
 * @param {string} language - Transcription language
 * @param {object} fs - fs-extra instance
 */
async function processWhisperVoice(tempFilePath, language, fs) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(tempFilePath),
    model: "whisper-1",
    language: language,
  });

  const transcript = transcription.text;
  if (!transcript || transcript.trim().length === 0) {
    return { transcript: "", summary: "I couldn't hear anything. Could you repeat that?", exit: false };
  }

  // LOCAL EXIT DETECTION
  const EXIT_PHRASES = ['thank you', 'stop', 'bye', 'goodbye', 'thanks', 'dismissed', 'stop dialogue', 'stop talking', 'cancel', 'finished', 'done'];
  const lowerTranscript = transcript.toLowerCase().trim().replace(/[.,!?]+$/, '');
  
  if (EXIT_PHRASES.includes(lowerTranscript)) {
    const exitResponse = lowerTranscript.includes('thank') ? "You're welcome! Talk soon." : "Goodbye.";
    return { transcript, summary: exitResponse, exit: true };
  }

  // Process with LLM
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a helpful farmer AI named Bessie. 
        - Keep responses extremely concise (1-2 sentences max) when possible. 
        - NO follow-up questions like "How can I assist you?" or "Is there anything else?". 
        - If the user says "thank you", "stop", "bye", or indicates they are done, call the 'terminate_conversation' tool immediately.
        - IMPORTANT: NEVER mention the tool name "terminate_conversation" in your audible response.
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

  // Safety filter: if the AI accidentally writes the tool name in the content
  if (aiResponse.includes('terminate_conversation')) {
    aiResponse = transcript.toLowerCase().includes('thank') ? "You're welcome! Talk soon." : "Goodbye.";
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolCall = message.tool_calls.find(tc => tc.function.name === 'terminate_conversation');
    if (toolCall) {
      shouldExit = true;
      if (!aiResponse) {
        aiResponse = transcript.toLowerCase().includes('thank') ? "You're welcome! Talk soon." : "Goodbye.";
      }
    }
  }

  return { transcript, summary: aiResponse, exit: shouldExit };
}

module.exports = {
  openai,
  getChatCompletion,
  processWhisperVoice
};
