const OpenAI = require('openai');
require('dotenv').config();

const service = {
  openai: new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),

  /**
   * Get a streaming response from OpenAI LLM (gpt-5-mini-2024-03-17 or similar)
   * @param {object} params
   * @param {string} params.text - User message
   * @param {Array} params.history - Optional previous chat history [{role, content}]
   * @param {string} params.systemMessage - Optional system prompt
   * @returns {Promise<AsyncGenerator<string>>}
   */
  async getChatStream({
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

    try {
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-5-mini', 
        messages: messages,
        tools: [
          {
            type: "function",
            function: {
              name: "terminate_conversation",
              description: "Call this when the user is finished or says goodbye.",
              parameters: { type: "object", properties: {} }
            }
          }
        ],
        stream: true,
      });

      return (async function* () {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          let content = delta?.content || "";
          
          // Technical Filter: Strip out any tool call tags if they leak into text
          if (content.includes('<assistant') || content.includes('tool=')) {
            content = content.replace(/<assistant\b[^>]*\/?>/gi, "");
            content = content.replace(/tool\s*=\s*"[^"]*"/gi, "");
          }

          if (content.trim()) yield { content };

          // Check for Tool Calls
          const toolCalls = delta?.tool_calls;
          if (toolCalls && toolCalls.some(tc => tc.function?.name === 'terminate_conversation')) {
            yield { content: " Goodbye!", terminate: true };
          }
        }
      })();
    } catch (error) {
      console.error("[OpenAI] Chat error:", error);
      throw error;
    }
  }
};

module.exports = service;
