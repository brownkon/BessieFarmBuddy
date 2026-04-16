const test = require('node:test');
const assert = require('node:assert');
const cacheService = require('../index');

test('Cache Service: generateKey', (t) => {
  const key = cacheService.generateKey('get_cow_info', { animalNumber: '77' });
  assert.strictEqual(key, 'get_cow_info:{"animalNumber":"77"}');
  
  const keyNoArgs = cacheService.generateKey('get_health_alerts', null);
  assert.strictEqual(keyNoArgs, 'get_health_alerts:{}');
});

test('Cache Service: set and get', (t) => {
  const key = 'test:item';
  const val = { foo: 'bar' };
  
  cacheService.set(key, val);
  const retrieved = cacheService.get(key);
  
  assert.deepStrictEqual(retrieved, val);
});

test('Cache Service: TTL (time-to-live)', async (t) => {
  const key = 'ttl:test';
  const val = 'expiring';
  
  // Set with immediate TTL (1ms)
  cacheService.set(key, val, 1);
  
  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 5));
  
  const retrieved = cacheService.get(key);
  assert.strictEqual(retrieved, undefined, 'Item should have expired');
});
