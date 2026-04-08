const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs-extra');
const dataProcessor = require('../data-processor.js');

// Mock orgId
const orgId = 'test-org-id';

test('parseFile should correctly parse a Health report', async (t) => {
  // Create a temporary CSV file
  const testCsvPath = path.join(__dirname, 'health_test.csv');
  const csvContent = `﻿"","","Attention","",""
"Animal Number","Animal Tag Id","Sensor","Value","Severeness"
"182","6634654","Milk Drop<br/>","-20.2  <br/>","<span style='width:92%'class='severnesslinebar'></span><br/>"
`;
  await fs.writeFile(testCsvPath, csvContent);

  try {
    const cowMap = await dataProcessor.parseFile(testCsvPath, orgId);
    assert.strictEqual(cowMap.size, 1);
    const cow = cowMap.get('182');
    assert.strictEqual(cow.animal_number, '182');
    assert.strictEqual(cow.animal_tag_id, '6634654');
    assert.deepStrictEqual(cow.sensors, { 'Milk Drop': '-20.2' });
    assert.deepStrictEqual(cow.severeness, { 'Milk Drop': 92 });
  } finally {
    await fs.remove(testCsvPath);
  }
});

test('parseFile should correctly parse a Calendar report', async (t) => {
  const testCsvPath = path.join(__dirname, 'calendar_test.csv');
  const csvContent = `"Animal Number","Robot","Animal Tag Id","Animal Life No. ","Group","Location","Lactation No.","Lactation days","Reproduction Status","Last Insemination","Days Pregnant","Days to Dry Off","Expected Calving Date","Production Status","Gender"
"10","Robot 1","12345","NL123456789","Group A","Barn 1","3","120","Pregnant","2026-01-01","90","100","2026-07-01","Lactating","Female"
`;
  await fs.writeFile(testCsvPath, csvContent);

  try {
    const cowMap = await dataProcessor.parseFile(testCsvPath, orgId);
    assert.strictEqual(cowMap.size, 1);
    const cow = cowMap.get('10');
    assert.strictEqual(cow.animal_number, '10');
    assert.strictEqual(cow.robot, 'Robot 1');
    assert.strictEqual(cow.location, 'Barn 1');
    assert.strictEqual(cow.lactation_no, 3);
    assert.strictEqual(cow.days_pregnant, 90);
  } finally {
    await fs.remove(testCsvPath);
  }
});

test('mergeCowData should combine data from multiple sources', (t) => {
  const existing = {
    animal_number: '123',
    location: 'Barn 1',
    sensors: { 'Milk Drop': '10' }
  };
  const incoming = {
    animal_number: '123',
    sick_chance: 80,
    sensors: { 'Mastitis': 'High' }
  };
  
  const merged = dataProcessor.mergeCowData(existing, incoming);
  assert.strictEqual(merged.location, 'Barn 1');
  assert.strictEqual(merged.sick_chance, 80);
  // Sensors should be merged
  assert.deepStrictEqual(merged.sensors, {
    'Milk Drop': '10',
    'Mastitis': 'High'
  });
});

test('parseFile should handle duplicate columns by appending _2, _3, etc.', async (t) => {
  const testCsvPath = path.join(__dirname, 'duplicate_test.csv');
  const csvContent = `"Animal Number","Milkings","Milkings"
"99","3","2"
`;
  await fs.writeFile(testCsvPath, csvContent);

  try {
    const cowMap = await dataProcessor.parseFile(testCsvPath, orgId);
    assert.strictEqual(cowMap.size, 1);
    const cow = cowMap.get('99');
    assert.strictEqual(cow.milkings_lactation, 3);
    assert.strictEqual(cow.milkings_milk, 2);
  } finally {
    await fs.remove(testCsvPath);
  }
});
