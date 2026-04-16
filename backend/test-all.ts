const test = require('node:test');
const assert = require('node:assert');

// 1. Setup Mock Environments
process.env.OPENAI_API_KEY = 'dummy_openai';
process.env.GROQ_API_KEY = 'dummy_groq';

// 2. Import Modular Services
const { dataProcessor, cleaner } = require('./services/data-prep');
const cacheService = require('./services/cache');
const groqService = require('./services/groq');
const openaiService = require('./services/openai'); 
// We test internals for modularity
const { classifyRequest } = require('./services/openai/classifier');
const { streamResponse } = require('./services/openai/orchestrator');

/**
 * CACHE SERVICE TESTS
 */
test('Cache: Key Generation and TTL', async (t) => {
  const key = cacheService.generateKey('test', { id: 1 });
  assert.strictEqual(key, 'test:{"id":1}');
  
  cacheService.set('ttl', 'val', 5);
  assert.strictEqual(cacheService.get('ttl'), 'val');
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(cacheService.get('ttl'), undefined);
});

/**
 * DATA PREP TESTS
 */
test('Data-Prep: Cleaner Logic', (t) => {
  const result = cleaner.mapSensorData('Activity', '120', "<span style='width:80%'></span>");
  assert.strictEqual(result.sensors['Activity'], '120');
  assert.strictEqual(result.severeness['Activity'], 80);
});

/**
 * GROQ SERVICE TESTS (Mocked)
 */
test('Groq: Transcription Mock', async (t) => {
  const originalGroq = groqService.groq;
  groqService.groq = {
    audio: {
      transcriptions: { create: async () => ({ text: 'Mock transcription' }) }
    }
  };
  
  const text = await groqService.transcribeAudio('dummy.m4a', 'en', {
    createReadStream: () => 'stream'
  });
  assert.strictEqual(text, 'Mock transcription');
  groqService.groq = originalGroq; // Restore
});

/**
 * OPENAI SERVICE TESTS (Mocked)
 */
test('OpenAI: Orchestration with Router', async (t) => {
  const mockOpenAI = {
    chat: {
      completions: {
        create: async (params) => {
          if (params.model === 'gpt-5-nano') {
            return { choices: [{ message: { content: JSON.stringify({ should_call_tool: false, confidence: 0.9 }) } }] };
          }
          if (params.stream) {
            async function* gen() { yield { choices: [{ delta: { content: "Direct Answer" } }] }; }
            return gen();
          }
          return { choices: [{ message: { content: "Direct Answer" } }] };
        }
      }
    }
  };

  const decision = await classifyRequest(mockOpenAI, 'Hi', []);
  assert.strictEqual(decision.should_call_tool, false);

  const stream = await streamResponse({ openai: mockOpenAI, messages: [], needsTool: false });
  let result = "";
  for await (const chunk of stream) result += chunk.content || "";
  assert.strictEqual(result, "Direct Answer");
});

/**
 * TOOLS & DAILY REPORT TESTS
 */
test('Tools: Modular definitions load successfully', (t) => {
  const { tools } = require('./tools/index');
  
  // Assert that newly created modular tools exist
  assert.ok(tools['get_specific_metric'], 'get_specific_metric tool not found');
  assert.strictEqual(tools['get_specific_metric'].definition.function.name, 'get_specific_metric');
  
  assert.ok(tools['record_note'], 'record_note tool not found');
  assert.ok(tools['get_cows_by_reproduction_status'], 'reproduction tool not found');
  assert.ok(tools['get_recent_notes'], 'recent_notes tool not found');
});

test('Daily Report: Script function maps correctly', (t) => {
  const { generateDailyReport } = require('./services/data-prep/daily-report');
  assert.strictEqual(typeof generateDailyReport, 'function', 'generateDailyReport should be a function');
});

console.log('--- Integrated Test Suite Created (incl. Tools) ---');
