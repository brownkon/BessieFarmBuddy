import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { classifyRequest } from './classifier';
import { streamResponse } from './orchestrator';
import 'dotenv/config';

const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai'; // 'openai' or 'groq'
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.7');

// Initialize the correct client
let client: any;
let mainModel: string;

if (LLM_PROVIDER === 'groq') {
  console.log('[AI Service] Initializing Groq for development...');
  client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  mainModel = 'llama-3.1-8b-instant'; // Faster with higher rate limits for dev
} else {
  console.log('[AI Service] Initializing OpenAI for production...');
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  mainModel = 'gpt-4o-mini'; // Reliable for production
}

export const openaiService = {
  /**
   * Get a streaming response from the configured AI provider with cost-efficient tool handling.
   */
  async getChatStream({ text, history = [], language = 'en', systemMessage = null, context = {} }: any) {
    const finalSystemMessage = systemMessage || `You are Bessie, a helpful farmer's assistant AI. 
        - Tools are expensive. Only use them when the answer cannot be reasonably inferred.
        - Before calling a tool, think through the problem and confirm it's strictly necessary.
        - You have access to real-time tools for cow health, production, and farm management.
        - Use the 'terminate_conversation' tool if the user says goodbye or is clearly finished.
        - Keep responses extremely concise (1-2 sentences max). 
        - NO follow-up questions unless absolutely neccessary. 
        - Assume that "cal" should mean "cow".
        - Current language: ${language}. Always respond in ${language}.`;

    // Trim history to stay within context limits
    const trimmedHistory = history.slice(-10);

    const messages = [
      { role: 'system', content: finalSystemMessage },
      ...trimmedHistory,
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
      let earlyToolName = null;
      if (classification.should_call_tool && classification.confidence >= CONFIDENCE_THRESHOLD) {
        const { tool_name, arguments: args } = classification;
        earlyToolName = tool_name;
        console.log(`[Router] Executing ${tool_name} early with args: ${JSON.stringify(args)}`);

        // Special Case: Early Exit for Termination
        if (tool_name === 'terminate_conversation') {
          return (async function* () {
            yield { toolCall: 'terminate_conversation' };
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
        } catch (toolErr: any) {
          console.error(`[Router] Tool execution failed: ${toolErr.message}`);
          earlyToolName = null; // Don't log if it failed
        }
      }

      const streamStart = Date.now();
      const mainStream = await streamResponse({
        client: client,
        model: mainModel,
        messages,
        needsTool: false, // NO tools passed to the second model for speed/cost
        context,
        provider: LLM_PROVIDER
      });
      console.log(`[Timer] Total pre-stream took: ${Date.now() - startTime}ms`);

      return (async function* () {
        if (earlyToolName) yield { toolCall: earlyToolName };
        for await (const chunk of (mainStream as any)) {
          yield chunk;
        }
      })();

    } catch (error) {
      console.error("[AI Service] Routing error:", error);
      throw error;
    }
  },

  /**
   * Get a simple completion (non-streaming)
   */
  async generateCompletion(prompt: string, model: string = mainModel): Promise<string> {
    try {
      const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
      });
      return response.choices[0].message.content || "";
    } catch (error) {
      console.error("[AI Service] Completion error:", error);
      throw error;
    }
  }
};
