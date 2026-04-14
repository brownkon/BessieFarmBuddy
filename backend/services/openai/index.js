const OpenAI = require('openai');
const Groq = require('groq-sdk');
const { classifyRequest } = require('./classifier');
const { streamResponse } = require('./orchestrator');
require('dotenv').config();

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai'; // 'openai' or 'groq'
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;

// Initialize the correct client
let client;
let mainModel;

if (LLM_PROVIDER === 'groq') {
  console.log('[AI Service] Initializing Groq for development...');
  client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  mainModel = 'llama-3.1-70b-versatile'; // Powerful and fast for orchestrating
} else {
  console.log('[AI Service] Initializing OpenAI for production...');
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  mainModel = 'gpt-4o-mini'; // Reliable for production
}

const openaiService = {
  /**
   * Get a streaming response from the configured AI provider with cost-efficient tool handling.
   */
  async getChatStream({ text, history = [], language = 'en', systemMessage = null, context = {} }) {
    const finalSystemMessage = systemMessage || `You are Bessie, a helpful farmer's assistant AI. 
        - Tools are expensive. Only use them when the answer cannot be reasonably inferred.
        - Before calling a tool, think through the problem and confirm it's strictly necessary.
        - You have access to real-time tools for cow health, production, and farm management.
        - Use the 'terminate_conversation' tool if the user says goodbye or is clearly finished.
        - Keep responses extremely concise (1-2 sentences max). 
        - NO follow-up questions unless absolutely neccessary. 
        - Assume that "cal" should mean "cow".
        - Current language: ${language}. Always respond in ${language}.`;

    const messages = [
      { role: 'system', content: finalSystemMessage },
      ...history,
      { role: 'user', content: text }
    ];

    const startTime = Date.now();
    try {
      // 1. Initial Routing logic
      const routingStart = Date.now();
      // Only classify if using OpenAI (for JSON reliability) or if Groq is specified. 
      // Groq handles JSON well in llama-3.1.
      const classification = await classifyRequest(client, text, history, LLM_PROVIDER);
      console.log(`[Timer] Classification took: ${Date.now() - routingStart}ms`);

      // 2. Early Execution & Early Exit
      let toolResult = null;
      let finalNeedsTool = false;

      if (classification.should_call_tool && classification.confidence >= CONFIDENCE_THRESHOLD) {
        const { tool_name, arguments: args } = classification;
        console.log(`[Router] Executing ${tool_name} early with args: ${JSON.stringify(args)}`);

        // Special Case: Early Exit for Termination
        if (tool_name === 'terminate_conversation') {
          return (async function* () {
            yield { content: " Goodbye!", terminate: true };
          })();
        }

        try {
          const toolStart = Date.now();
          const { executeTool } = require('../../tools');
          const result = await executeTool(tool_name, args || {}, context);
          console.log(`[Timer] Tool execution (${tool_name}) took: ${Date.now() - toolStart}ms`);
          toolResult = result;

          // Inject instructions to use this data
          messages.push({
            role: 'system',
            content: `CRITICAL DATA: The tool ${tool_name} returned the following data. Use this data ONLY to answer the user's question precisely. 
            Data: ${JSON.stringify(result)}`
          });
        } catch (toolErr) {
          console.error(`[Router] Tool execution failed: ${toolErr.message}`);
        }
      }

      const streamStart = Date.now();
      const result = await streamResponse({
        client: client,
        model: mainModel,
        messages,
        needsTool: false, // NO tools passed to the second model for speed/cost
        context,
        provider: LLM_PROVIDER
      });
      console.log(`[Timer] Total pre-stream took: ${Date.now() - startTime}ms`);
      return result;

    } catch (error) {
      console.error("[AI Service] Routing error:", error);
      throw error;
    }
  }
};

module.exports = openaiService;
