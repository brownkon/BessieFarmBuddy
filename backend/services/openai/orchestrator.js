const { getToolDefinitions, executeTool } = require('../../tools');
const cacheService = require('../cache');

/**
 * Orchestrator module handles the tool execution loop and streaming responses.
 */
async function streamResponse({ client, model, messages, needsTool, toolCallsCount = 0, context = {}, provider = 'openai' }) {
  const creationStart = Date.now();
  const completion = await client.chat.completions.create({
    model: model,
    messages: messages,
    tools: needsTool ? getToolDefinitions() : undefined,
    stream: true,
  });
  console.log(`[Timer] ${provider} create call took: ${Date.now() - creationStart}ms`);

  return (async function* () {
    let currentToolCall = null;
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
        let result = "";
        try {
          const args = toolArguments ? JSON.parse(toolArguments) : {};

          if (currentToolCall === 'terminate_conversation') {
            yield { content: " Goodbye!", terminate: true };
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
            if (typeof result === 'object') {
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
              tool_call_id: toolResultMessage.tool_calls[0].id,
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

module.exports = { streamResponse };
