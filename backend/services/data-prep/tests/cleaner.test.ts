const test = require('node:test');
const assert = require('node:assert');
const { parseMultiline, parseSevereness, mapSensorData } = require('../cleaner.js');

test('parseMultiline should split by <br/> and clean whitespace', (t) => {
  const input = 'Milk Drop<br/>SCC Indication<br/>';
  const expected = ['Milk Drop', 'SCC Indication'];
  assert.deepStrictEqual(parseMultiline(input), expected);
});

test('parseSevereness should extract numbers after width:', (t) => {
  const input = "<span style='width:92%' class='severnesslinebar'></span><br/><span style='width:50%' class='severnesslinebar'></span>";
  const expected = [92, 50];
  assert.deepStrictEqual(parseSevereness(input), expected);
});

test('mapSensorData should correctly map sensors, values, and severeness', (t) => {
  const sensorHtml = "Milk Drop<br/>SCC Indication<br/>";
  const valueHtml = "-20.2&nbsp; <br/>1419&nbsp; <br/>";
  const severenessHtml = "<span style='width:92%'></span><br/><span style='width:100%'></span><br/>";
  
  const result = mapSensorData(sensorHtml, valueHtml, severenessHtml);
  
  assert.deepStrictEqual(result.sensors, {
    'Milk Drop': '-20.2',
    'SCC Indication': '1419'
  });
  assert.deepStrictEqual(result.severeness, {
    'Milk Drop': 92,
    'SCC Indication': 100
  });
});

