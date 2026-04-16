import test from 'node:test';
import assert from 'node:assert';
import { dataProcessor, cleaner } from '../services/data-prep';
import cacheService from '../services/cache';
import groqService from '../services/groq';
import { openaiService } from '../services/openai'; 
import { classifyRequest } from '../services/openai/classifier';
import { streamResponse } from '../services/openai/orchestrator';
import { tools } from '../tools/index';
import { generateDailyReport } from '../services/data-prep/daily-report';


// 1. Setup Mock Environments
process.env.OPENAI_API_KEY = 'dummy_openai';
process.env.GROQ_API_KEY = 'dummy_groq';

/**
 * CACHE SERVICE TESTS
 */
test('Cache: Key Generation and TTL', async () => {
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
test('Data-Prep: Cleaner Logic', () => {
  const result = cleaner.mapSensorData('Activity', '120', "<span style='width:80%'></span>");
  assert.strictEqual(result.sensors['Activity'], '120');
  assert.strictEqual(result.severeness['Activity'], 80);
});

/**
 * GROQ SERVICE TESTS (Mocked)
 */
test('Groq: Transcription Mock', async () => {
  const originalGroq = groqService.groq;
  groqService.groq = {
    audio: {
      transcriptions: { create: async () => ({ text: 'Mock transcription' }) } as any
    }
  } as any;
  
  const text = await groqService.transcribeAudio('dummy.m4a', 'en', {
    createReadStream: () => 'stream'
  } as any);
  assert.strictEqual(text, 'Mock transcription');
  groqService.groq = originalGroq; // Restore
});

/**
 * OPENAI SERVICE TESTS (Mocked)
 */
test('OpenAI: Orchestration with Router', async () => {
  const mockOpenAI: any = {
    chat: {
      completions: {
        create: async (params: any) => {
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
  for await (const chunk of (stream as any)) result += chunk.content || "";
  assert.strictEqual(result, "Direct Answer");
});

/**
 * TOOLS & DAILY REPORT TESTS
 */
test('Tools: Modular definitions load successfully', () => {
  // Assert that newly created modular tools exist
  assert.ok(tools['get_specific_metric'], 'get_specific_metric tool not found');
  assert.strictEqual(tools['get_specific_metric'].definition.function.name, 'get_specific_metric');
  
  assert.ok(tools['record_note'], 'record_note tool not found');
  assert.ok(tools['get_pregnancy_status'], 'reproduction tool not found');
  assert.ok(tools['get_recent_notes'], 'recent_notes tool not found');
});


test('Daily Report: Script function maps correctly', () => {
  assert.strictEqual(typeof generateDailyReport, 'function', 'generateDailyReport should be a function');
});

console.log('--- Integrated Test Suite Created (incl. Tools) ---');

