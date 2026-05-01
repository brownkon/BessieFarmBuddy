import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import { stripNulls, stripHtmlFromValues, parseHealthRemark, buildReportEnvelope, omitFields, pickFields } from '../services/data-prep/utils';

// ─── stripNulls ──────────────────────────────────────────────────────────────

test('stripNulls: removes null, undefined, and empty string keys', () => {
  const input = {
    animal_number: 250,
    name: null,
    group: undefined,
    location: '',
    production: 47.2
  };
  const result = stripNulls(input);
  assert.deepStrictEqual(result, { animal_number: 250, production: 47.2 });
});

test('stripNulls: preserves zero and false values', () => {
  const input = { count: 0, active: false, name: null };
  const result = stripNulls(input);
  assert.deepStrictEqual(result, { count: 0, active: false });
});

test('stripNulls: handles arrays of objects', () => {
  const input = [
    { animal_number: 1, name: null, production: 30 },
    { animal_number: 2, name: 'Bessie', production: null }
  ];
  const result = stripNulls(input);
  assert.deepStrictEqual(result, [
    { animal_number: 1, production: 30 },
    { animal_number: 2, name: 'Bessie' }
  ]);
});

test('stripNulls: returns primitives unchanged', () => {
  assert.strictEqual(stripNulls('hello'), 'hello');
  assert.strictEqual(stripNulls(42), 42);
  assert.strictEqual(stripNulls(null), null);
});

// ─── parseHealthRemark ───────────────────────────────────────────────────────

test('parseHealthRemark: extracts boolean attributes from healthremarks div', () => {
  const html = "<div class='healthremarks' bWeight='True' bMastitis='False' bPlanned='True'></div>";
  const result = parseHealthRemark(html);
  assert.deepStrictEqual(result, {
    weight_issue: true,
    mastitis: false,
    planned_treatment: true
  });
});

test('parseHealthRemark: returns null for empty/non-health HTML', () => {
  assert.strictEqual(parseHealthRemark(''), null);
  assert.strictEqual(parseHealthRemark(null), null);
  assert.strictEqual(parseHealthRemark('<div>random</div>'), null);
});

test('parseHealthRemark: all false attributes returns structured object', () => {
  const html = "<div class='healthremarks' bWeight='False' bMastitis='False' bPlanned='False'></div>";
  const result = parseHealthRemark(html);
  assert.deepStrictEqual(result, {
    weight_issue: false,
    mastitis: false,
    planned_treatment: false
  });
});

// ─── stripHtmlFromValues ─────────────────────────────────────────────────────

test('stripHtmlFromValues: strips HTML tags from string values', () => {
  const input = { note: '<b>Important</b> update', count: 5 };
  const result = stripHtmlFromValues(input);
  assert.deepStrictEqual(result, { note: 'Important update', count: 5 });
});

test('stripHtmlFromValues: replaces healthremarks divs with parsed object', () => {
  const input = {
    animal_number: 250,
    health_remark: "<div class='healthremarks' bWeight='False' bMastitis='True' bPlanned='False'></div>"
  };
  const result = stripHtmlFromValues(input);
  assert.deepStrictEqual(result, {
    animal_number: 250,
    health_remark: { weight_issue: false, mastitis: true, planned_treatment: false }
  });
});

test('stripHtmlFromValues: handles arrays', () => {
  const input = [
    { name: '<i>Cow A</i>' },
    { name: 'Cow B' }
  ];
  const result = stripHtmlFromValues(input);
  assert.deepStrictEqual(result, [
    { name: 'Cow A' },
    { name: 'Cow B' }
  ]);
});

test('stripHtmlFromValues: strips timeperiod divs to empty string', () => {
  const input = {
    optimum: "<div class='timeperiod' nStart='180' nEnd='1080' nCurrent='1887'></div>"
  };
  const result = stripHtmlFromValues(input);
  // timeperiod div has no text content, so it becomes empty string
  assert.strictEqual(result.optimum, '');
});

// ─── buildReportEnvelope ─────────────────────────────────────────────────────

test('buildReportEnvelope: wraps array data with metadata', () => {
  const data = [{ animal_number: 1 }, { animal_number: 2 }];
  const result = buildReportEnvelope('Fetch Report', data);

  assert.strictEqual(result.report, 'Fetch Report');
  assert.strictEqual(result.total_cows, 2);
  assert.ok(result.generated_at, 'should have generated_at');
  assert.deepStrictEqual(result.data, data);
});

test('buildReportEnvelope: handles empty array', () => {
  const result = buildReportEnvelope('Health Alerts', []);
  assert.strictEqual(result.total_cows, 0);
  assert.deepStrictEqual(result.data, []);
});

test('buildReportEnvelope: handles single object (non-array)', () => {
  const data = { animal_number: 250, production: 47.2 };
  const result = buildReportEnvelope('Cow Info', data);
  assert.strictEqual(result.total_cows, 1);
  assert.deepStrictEqual(result.data, data);
});

// ─── omitFields ──────────────────────────────────────────────────────────────

test('omitFields: strips default internal fields (id, organization_id, updated_at)', () => {
  const input = {
    id: 'abc-123',
    organization_id: 'org-456',
    updated_at: '2026-04-29',
    animal_number: 250,
    day_production: 47.2
  };
  const result = omitFields(input);
  assert.deepStrictEqual(result, { animal_number: 250, day_production: 47.2 });
});

test('omitFields: handles arrays of objects', () => {
  const input = [
    { id: '1', animal_number: 100, organization_id: 'org' },
    { id: '2', animal_number: 200, organization_id: 'org' }
  ];
  const result = omitFields(input);
  assert.deepStrictEqual(result, [
    { animal_number: 100 },
    { animal_number: 200 }
  ]);
});

test('omitFields: accepts custom field set', () => {
  const input = { animal_number: 250, secret: 'hidden', day_production: 47 };
  const result = omitFields(input, new Set(['secret']));
  assert.deepStrictEqual(result, { animal_number: 250, day_production: 47 });
});

test('omitFields: returns primitives unchanged', () => {
  assert.strictEqual(omitFields('text'), 'text');
  assert.strictEqual(omitFields(null), null);
});

// ─── pickFields ──────────────────────────────────────────────────────────────

test('pickFields: picks only specified fields', () => {
  const input = { animal_number: 250, day_production: 47, secret: 'x', id: '1' };
  const result = pickFields(input, ['animal_number', 'day_production']);
  assert.deepStrictEqual(result, { animal_number: 250, day_production: 47 });
});

test('pickFields: handles arrays', () => {
  const input = [
    { animal_number: 1, day_production: 30, extra: 'a' },
    { animal_number: 2, day_production: 40, extra: 'b' }
  ];
  const result = pickFields(input, ['animal_number', 'day_production']);
  assert.deepStrictEqual(result, [
    { animal_number: 1, day_production: 30 },
    { animal_number: 2, day_production: 40 }
  ]);
});

test('pickFields: returns primitives unchanged', () => {
  assert.strictEqual(pickFields('text', ['a']), 'text');
  assert.strictEqual(pickFields(null, ['a']), null);
});

