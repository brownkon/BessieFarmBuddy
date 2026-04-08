const OpenAI = require('openai');
const { classifyRequest } = require('./classifier');
const { streamResponse } = require('./orchestrator');
require('dotenv').config();

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const openaiService = {
  /**
   * Get a streaming response from OpenAI with cost-efficient tool handling.
   */
  async getChatStream({ text, history = [], language = 'en', systemMessage = null, context = {} }) {
    const finalSystemMessage = systemMessage || `You are Bessie, a helpful farmer's assistant AI. 
        - Tools are expensive. Only use them when the answer cannot be reasonably inferred.
        - Before calling a tool, think through the problem and confirm it's strictly necessary.
        - You have access to real-time tools for cow health, production, and farm management.
        - Keep responses extremely concise (1-2 sentences max). 
        - NO follow-up questions unless absolutely neccessary. 
        - Current language: ${language}. Always respond in ${language}.`;

    const messages = [
      { role: 'system', content: finalSystemMessage },
      ...history,
      { role: 'user', content: text }
    ];

    try {
      // 1. Initial Routing logic
      const classification = await classifyRequest(client, text, history);
      console.log(`[Router] Decision: ${JSON.stringify(classification)}`);

      // 2. Start streaming with tool definitions only if strictly necessary
      const needsTool = classification.should_call_tool && classification.confidence >= CONFIDENCE_THRESHOLD;

      return await streamResponse({
          openai: client,
          messages,
          needsTool,
          context
      });

    } catch (error) {
      console.error("[OpenAI Service] Routing error:", error);
      throw error;
    }
  }
};

module.exports = openaiService;
