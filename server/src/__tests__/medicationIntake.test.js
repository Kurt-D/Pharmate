import { manilaToday, parseStrength, validateIntakeRecord } from '../services/medicationIntake.js';

const verifiedDrug = {
  generic_name: 'Paracetamol',
  brand_names_json: JSON.stringify(['Biogesic']),
  dosage_form: 'Tablet',
  default_strength: '500 mg',
};

function validRecord(overrides = {}) {
  return {
    medicine_name: 'Paracetamol',
    dosage_form: 'Tablet',
    dosage_instruction: 'Take 1 tablet',
    quantity_on_hand: 30,
    quantity_unit: 'tablets',
    start_date: manilaToday(),
    entry_method: 'MANUAL',
    label_frequency: 'QD',
    label_food_instruction: 'NONE',
    patient_confirmed: true,
    ...overrides,
  };
}

test('accepts a patient-confirmed formulary match and normalizes strength', () => {
  const result = validateIntakeRecord(validRecord(), verifiedDrug);
  expect(result.error).toBeUndefined();
  expect(result.value).toMatchObject({
    medicine_name: 'Paracetamol',
    dosage_form: 'Tablet',
    strength_value: 500,
    strength_unit: 'mg',
    quantity_on_hand: 30,
  });
  expect(parseStrength('5 mL')).toEqual({ value: 5, unit: 'mL' });
});

test('preserves the strength and form the patient confirmed from the medicine label', () => {
  const result = validateIntakeRecord(
    validRecord({
      custom_strength: '250 mg',
      dosage_form: 'Capsule',
      purpose: 'Pain relief',
      end_date: manilaToday(),
      refill_reminders_enabled: true,
    }),
    verifiedDrug
  );

  expect(result.error).toBeUndefined();
  expect(result.value).toMatchObject({
    strength_value: 250,
    strength_unit: 'mg',
    dosage_form: 'Capsule',
    purpose: 'Pain relief',
    refill_reminders_enabled: true,
  });
});

test('accepts an exact verified brand name but rejects an unrelated typed medicine', () => {
  expect(
    validateIntakeRecord(validRecord({ medicine_name: 'Biogesic' }), verifiedDrug).error
  ).toBeUndefined();
  expect(
    validateIntakeRecord(validRecord({ medicine_name: 'Ibuprofen' }), verifiedDrug).error
  ).toMatch(/Confirm Paracetamol/);
});

test.each([
  [{ dosage_instruction: '' }, /dosage exactly/],
  [{ dosage_form: '' }, /dosage form/],
  [{ custom_strength: 'strong' }, /strength shown on the label/],
  [{ quantity_on_hand: '' }, /valid current quantity/],
  [{ quantity_unit: '' }, /quantity unit/],
  [{ label_frequency: '' }, /how often/],
  [{ patient_confirmed: false }, /Review and confirm/],
])('rejects incomplete or mismatched intake data: %p', (override, message) => {
  expect(validateIntakeRecord(validRecord(override), verifiedDrug).error).toMatch(message);
});

test('requires valid OCR confidence and never treats OCR as confirmation', () => {
  expect(
    validateIntakeRecord(
      validRecord({
        entry_method: 'OCR',
        ocr_confidence: 0.9,
        patient_confirmed: false,
      }),
      verifiedDrug
    ).error
  ).toMatch(/Review and confirm/);
  expect(
    validateIntakeRecord(
      validRecord({
        entry_method: 'OCR',
        ocr_confidence: 2,
      }),
      verifiedDrug
    ).error
  ).toMatch(/between 0 and 1/);
});
