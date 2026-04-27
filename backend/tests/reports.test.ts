import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert';
import { tools } from '../tools/index';

test('Reports Tools: registered correctly', () => {
  assert.ok(tools['get_fetch_report'], 'get_fetch_report tool not found');
  assert.ok(tools['get_milk_separation_report'], 'get_milk_separation_report tool not found');
  assert.ok(tools['get_health_treatment_report'], 'get_health_treatment_report tool not found');
  assert.ok(tools['get_health_report'], 'get_health_report tool not found');
  assert.ok(tools['get_heat_insemination_report'], 'get_heat_insemination_report tool not found');
  assert.ok(tools['get_heat_probability_report'], 'get_heat_probability_report tool not found');
  assert.ok(tools['get_calving_report'], 'get_calving_report tool not found');
  
  assert.strictEqual(tools['get_fetch_report'].definition.function.name, 'get_fetch_report');
  assert.strictEqual(tools['get_milk_separation_report'].definition.function.name, 'get_milk_separation_report');
  assert.strictEqual(tools['get_health_treatment_report'].definition.function.name, 'get_health_treatment_report');
  assert.strictEqual(tools['get_health_report'].definition.function.name, 'get_health_report');
  assert.strictEqual(tools['get_heat_insemination_report'].definition.function.name, 'get_heat_insemination_report');
  assert.strictEqual(tools['get_heat_probability_report'].definition.function.name, 'get_heat_probability_report');
  assert.strictEqual(tools['get_calving_report'].definition.function.name, 'get_calving_report');
});

test('Reports Tools: handlers are functions', () => {
  assert.strictEqual(typeof tools['get_fetch_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_milk_separation_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_health_treatment_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_health_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_heat_insemination_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_heat_probability_report'].handler, 'function');
  assert.strictEqual(typeof tools['get_calving_report'].handler, 'function');
});
