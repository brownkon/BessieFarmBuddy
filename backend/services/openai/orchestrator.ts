import { getToolDefinitions, executeTool } from '../../tools';
import cacheService from '../cache';

/**
 * Orchestrator module handles the tool execution loop and streaming responses.
 */
export async function streamResponse({ 
  client, 
  model, 
  messages, 
  needsTool, 
  toolCallsCount = 0, 
  context = {}, 
  provider = 'openai' 
}: any): Promise<AsyncGenerator<any, void, unknown>> {
  const creationStart = Date.now();
  console.log(`[AI Service] Starting stream for model: ${model}`);
  let completion: any;
  try {
    completion = await client.chat.completions.create({
      model: model,
      messages: messages,
      tools: needsTool ? getToolDefinitions() : undefined,
      stream: true,
    });
  } catch (err: any) {
    console.error(`[${provider}] API Error:`, err.message);
    return (async function* () {
      if (err.message.includes('rate_limit') || err.status === 413) {
        yield { content: " I'm sorry, that request was too large for my current capacity. Please try a shorter question or start a new chat." };
      } else {
        yield { content: ` I'm sorry, I encountered an API error: ${err.message}` };
      }
    })();
  }
  console.log(`[Timer] ${provider} create call took: ${Date.now() - creationStart}ms`);

  return (async function* () {
    let currentToolCall: string | null = null;
    let toolArguments = "";

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta;
      let content = delta?.content || "";
      if (content.trim()) yield { content };

      // Tool Handling (up to 2 calls)
      const toolCalls = delta?.tool_calls;
      if (toolCalls && toolCalls.length > 0 && toolCallsCount < 2) {
        const tc = toolCalls[0];
        if (tc.function?.name) {
          currentToolCall = tc.function.name;
          toolArguments = "";
        }
        if (tc.function?.arguments) {
          toolArguments += tc.function.arguments;
        }
      }

      if (chunk.choices[0]?.finish_reason === 'tool_calls' && currentToolCall) {
        // Execute Tool with Caching
        let result: any = "";
        try {
          // Track the tool call
          yield { toolCall: currentToolCall };

          const args = toolArguments ? JSON.parse(toolArguments) : {};

          if (currentToolCall === 'terminate_conversation') {
            yield { terminate: true, content: " Goodbye!" };
            return;
          }

          const cacheKey = cacheService.generateKey(currentToolCall, args);
          const cachedResult = cacheService.get(cacheKey);

          if (cachedResult) {
            console.log(`[Cache] Hit for ${currentToolCall}`);
            result = cachedResult;
          } else {
            console.log(`[Cache] Miss for ${currentToolCall}`);
            result = await executeTool(currentToolCall, args, context);
            // Control output size
            if (typeof result === 'object' && result !== null) {
              const strResult = JSON.stringify(result);
              if (strResult.length > 2000) {
                result = { summary: "Result too large, summarized.", data: strResult.substring(0, 1000) + "..." };
              }
            }
            cacheService.set(cacheKey, result);
          }

          const toolResultMessage = {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_' + Math.random().toString(36).substr(2, 9),
              type: 'function',
              function: { name: currentToolCall, arguments: toolArguments }
            }]
          };

          const systemFollowup = [
            ...messages,
            toolResultMessage,
            {
              role: 'tool',
              tool_call_id: (toolResultMessage.tool_calls[0] as any).id,
              content: JSON.stringify(result)
            }
          ];

          // Recursive call for multi-turn tools (cap at 2)
          const followUpStream = await streamResponse({
            client,
            model,
            messages: systemFollowup,
            needsTool: true,
            toolCallsCount: toolCallsCount + 1,
            context,
            provider
          });

          for await (const chunk of followUpStream) {
            yield chunk;
          }
        } catch (err) {
          console.error(`[${provider}] Tool execution error:`, err);
          yield { content: " I'm sorry, I encountered an error retrieving that data." };
        }
      }
    }
  })();
}

export default { streamResponse };
