import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateFieldConfidence,
  classifyImageQuality,
  extractMedicineFields,
  extractPrescriptionQuantity,
} from './mlKitOcr.js';

test('extracts Philippine label strength and oral formulation', () => {
  assert.deepEqual(extractMedicineFields('BIOGESIC\nParacetamol 500 mg\nFilm-coated Tablet'), {
    name: 'Biogesic',
    strength: '500 mg',
    formulation: 'Tablet',
  });
  assert.deepEqual(
    extractMedicineFields('AMOXICILLIN\n250 mg / 5 mL\nPOWDER FOR ORAL SUSPENSION'),
    {
      name: 'Amoxicillin',
      strength: '250 mg / 5 mL',
      formulation: 'Oral Suspension',
    }
  );
});

test('extracts an explicit prescription quantity without confusing the dose strength', () => {
  assert.equal(extractPrescriptionQuantity('Amoxicillin 500 mg\nQty: 30 tablets'), 30);
  assert.equal(extractPrescriptionQuantity('Cetirizine 10 mg\nDispense 14'), 14);
  assert.equal(extractPrescriptionQuantity('Metformin 500 mg twice daily'), null);
});

test('recognizes common formulations and concentration strengths', () => {
  const result = extractMedicineFields('Clotrimazole Cream 1%');
  assert.equal(result.name, 'Clotrimazole');
  assert.equal(result.strength, '1%');
  assert.equal(result.formulation, 'Cream');
});

test('reads common OCR spacing and unit mistakes in medicine strengths', () => {
  assert.equal(extractMedicineFields('Paracetamol 500mg tablet').strength, '500 mg');
  assert.equal(extractMedicineFields('Amoxicillin 250 m g / 5 m l').strength, '250 mg / 5 mL');
  assert.equal(extractMedicineFields('Vitamin D 1 000 IU capsule').strength, '1000 IU');
  assert.equal(extractMedicineFields('Folic acid 400 m9 tablet').strength, '400 mg');
  assert.equal(extractMedicineFields('Salbutamol 2 mg per 5 mL syrup').strength, '2 mg / 5 mL');
});

test('quality gate rejects blurry, dark, and small images', () => {
  assert.equal(
    classifyImageQuality({ width: 320, height: 800, brightness: 120, contrast: 40, sharpness: 100 })
      .code,
    'TOO_SMALL'
  );
  assert.equal(
    classifyImageQuality({ width: 1200, height: 800, brightness: 30, contrast: 40, sharpness: 100 })
      .code,
    'LOW_LIGHT'
  );
  assert.equal(
    classifyImageQuality({ width: 1200, height: 800, brightness: 120, contrast: 10, sharpness: 10 })
      .code,
    'BLURRY'
  );
});

test('confidence only clears the threshold with complete fields', () => {
  assert.equal(
    calculateFieldConfidence(
      { name: 'Paracetamol', strength: '', formulation: '' },
      'Paracetamol',
      1
    ),
    0.45
  );
  assert.equal(
    calculateFieldConfidence(
      { name: 'Paracetamol', strength: '500 mg', formulation: 'Tablet' },
      'Paracetamol 500 mg Tablet',
      1
    ),
    1
  );
});
