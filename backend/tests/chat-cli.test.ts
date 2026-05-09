/**
 * Tests for chat-cli-utils.ts
 * Run: npm test (or npx tsx --test tests/chat-cli.test.ts)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, formatToolCall, formatTiming } from '../scripts/chat-cli-utils';

describe('parseCliArgs', () => {
  it('returns defaults when no args are provided', () => {
    const result = parseCliArgs([]);
    assert.deepStrictEqual(result, {
      language: 'en',
      single: null,
      noColor: false,
      verbose: false,
    });
  });

  it('parses --lang=es correctly', () => {
    const result = parseCliArgs(['--lang=es']);
    assert.equal(result.language, 'es');
  });

  it('parses --single with a following argument', () => {
    const result = parseCliArgs(['--single', 'How are the cows?']);
    assert.equal(result.single, 'How are the cows?');
  });

  it('ignores --single when no following argument exists', () => {
    const result = parseCliArgs(['--single']);
    assert.equal(result.single, null);
  });

  it('parses --no-color flag', () => {
    const result = parseCliArgs(['--no-color']);
    assert.equal(result.noColor, true);
  });

  it('parses --verbose flag', () => {
    const result = parseCliArgs(['--verbose']);
    assert.equal(result.verbose, true);
  });

  it('parses multiple flags together', () => {
    const result = parseCliArgs(['--lang=fr', '--verbose', '--no-color', '--single', 'test prompt']);
    assert.equal(result.language, 'fr');
    assert.equal(result.verbose, true);
    assert.equal(result.noColor, true);
    assert.equal(result.single, 'test prompt');
  });

  it('ignores unrecognized arguments', () => {
    const result = parseCliArgs(['--unknown', 'random-value', '--lang=de']);
    assert.equal(result.language, 'de');
    assert.equal(result.single, null);
  });
});

describe('formatToolCall', () => {
  it('uses known emoji for recognized tools', () => {
    const output = formatToolCall('get_health_alerts');
    assert.ok(output.includes('🏥'));
    assert.ok(output.includes('get_health_alerts'));
  });

  it('uses default emoji for unknown tools', () => {
    const output = formatToolCall('some_unknown_tool');
    assert.ok(output.includes('🔧'));
    assert.ok(output.includes('some_unknown_tool'));
  });

  it('includes ANSI reset code', () => {
    const output = formatToolCall('get_cow_info');
    assert.ok(output.includes('\x1b[0m'));
  });
});

describe('formatTiming', () => {
  it('includes elapsed time', () => {
    const output = formatTiming(123, []);
    assert.ok(output.includes('123ms'));
  });

  it('includes tool names when provided', () => {
    const output = formatTiming(500, ['get_cow_info', 'get_health_alerts']);
    assert.ok(output.includes('get_cow_info'));
    assert.ok(output.includes('get_health_alerts'));
  });

  it('omits tool section when no tools used', () => {
    const output = formatTiming(100, []);
    assert.ok(!output.includes('tools:'));
  });
});
