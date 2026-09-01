const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LABEL_FREQUENCIES = new Set([
  'QD',
  'BID',
  'TID',
  'QID',
  'Q4H',
  'Q6H',
  'Q8H',
  'Q12H',
  'BEDTIME',
  'PRN',
  'OTHER',
]);
const LABEL_FOOD_INSTRUCTIONS = new Set([
  'NONE',
  'WITH_MEAL',
  'BEFORE_MEAL',
  'AFTER_MEAL',
  'EMPTY_STOMACH',
]);
const FORM_ALIASES = new Map([
  ['tablet', 'tablet'],
  ['tablets', 'tablet'],
  ['capsule', 'capsule'],
  ['capsules', 'capsule'],
  ['syrup', 'syrup'],
  ['suspension', 'suspension'],
  ['solution', 'solution'],
  ['eye drops', 'eye drops'],
  ['eye drop', 'eye drops'],
  ['ear drops', 'ear drops'],
  ['ear drop', 'ear drops'],
  ['inhaler', 'inhaler'],
  ['injection', 'injection'],
  ['cream', 'topical'],
  ['ointment', 'topical'],
  ['topical', 'topical'],
  ['patch', 'patch'],
]);

export function manilaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function normalizeDosageForm(value) {
  return (
    FORM_ALIASES.get(
      String(value || '')
        .trim()
        .toLowerCase()
    ) ||
    String(value || '')
      .trim()
      .toLowerCase()
  );
}

export function parseStrength(value) {
  const match = String(value || '')
    .trim()
    .match(/(\d+(?:\.\d+)?)\s*(mcg|mg|g|ml|mL|units?|iu)\b/i);
  if (!match) return { value: null, unit: null };
  return { value: Number(match[1]), unit: match[2].toLowerCase() === 'ml' ? 'mL' : match[2] };
}

export function validateIntakeRecord(record, verifiedDrug, { allowExistingStart = false } = {}) {
  const medicineName = String(record?.medicine_name || verifiedDrug?.generic_name || '').trim();
  const customStrength = String(
    record?.custom_strength || verifiedDrug?.default_strength || verifiedDrug?.common_strength || ''
  ).trim();
  const dosageInstruction = String(record?.dosage_instruction || '').trim();
  const dosageForm = String(record?.dosage_form || '').trim();
  const quantityRaw = record?.quantity_on_hand;
  const quantity = Number(quantityRaw);
  const quantityUnit = String(record?.quantity_unit || '').trim();
  const startDate = String(record?.start_date || '').trim();
  const labelDirection = String(record?.label_direction || '').trim();
  const labelFrequency = String(record?.label_frequency || '')
    .trim()
    .toUpperCase();
  const labelFoodInstruction = String(record?.label_food_instruction || 'NONE')
    .trim()
    .toUpperCase();
  const entryMethod = String(record?.entry_method || 'MANUAL').toUpperCase();
  const confidence =
    record?.ocr_confidence === null || record?.ocr_confidence === undefined
      ? null
      : Number(record.ocr_confidence);

  if (!verifiedDrug) return { error: 'Select a medicine from the verified PharMate formulary.' };
  if (!medicineName || medicineName.length > 255) return { error: 'Enter a valid medicine name.' };
  const canonical = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  let acceptedNames = [verifiedDrug.generic_name];
  try {
    const brands =
      typeof verifiedDrug.brand_names_json === 'string'
        ? JSON.parse(verifiedDrug.brand_names_json)
        : verifiedDrug.brand_names_json;
    if (Array.isArray(brands)) acceptedNames = [...acceptedNames, ...brands];
  } catch {
    // A malformed optional brand list must not weaken generic-name matching.
  }
  if (!acceptedNames.some((name) => canonical(name) === canonical(medicineName))) {
    return {
      error: `Confirm ${verifiedDrug.generic_name} from the verified medicine suggestions.`,
    };
  }
  if (!dosageInstruction || dosageInstruction.length > 255) {
    return {
      error: `Enter the dosage exactly as shown on the label for ${verifiedDrug.generic_name}.`,
    };
  }
  if (!dosageForm) return { error: `Confirm the dosage form for ${verifiedDrug.generic_name}.` };
  const strength = parseStrength(customStrength);
  if (!strength.value || !strength.unit) {
    return {
      error: `Enter the strength shown on the label for ${verifiedDrug.generic_name}, including its unit.`,
    };
  }
  if (
    quantityRaw === '' ||
    quantityRaw === null ||
    quantityRaw === undefined ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 1_000_000
  ) {
    return { error: `Enter a valid current quantity for ${verifiedDrug.generic_name}.` };
  }
  if (!quantityUnit || quantityUnit.length > 50) {
    return { error: `Enter the quantity unit for ${verifiedDrug.generic_name}.` };
  }
  if (!DATE_RE.test(startDate) || Number.isNaN(Date.parse(`${startDate}T00:00:00Z`))) {
    return { error: `Choose a valid start date for ${verifiedDrug.generic_name}.` };
  }
  if (!LABEL_FREQUENCIES.has(labelFrequency)) {
    return {
      error: `Choose how often the label or prescription says to take ${verifiedDrug.generic_name}.`,
    };
  }
  if (labelFrequency === 'OTHER' && !labelDirection) {
    return {
      error: `Enter the other label or prescription instructions for ${verifiedDrug.generic_name}.`,
    };
  }
  if (!LABEL_FOOD_INSTRUCTIONS.has(labelFoodInstruction)) {
    return {
      error: `Choose the food instruction printed on the label for ${verifiedDrug.generic_name}.`,
    };
  }
  if (!allowExistingStart && startDate < manilaToday()) {
    return {
      error: `The schedule start date for ${verifiedDrug.generic_name} cannot be in the past.`,
    };
  }
  if (!['MANUAL', 'OCR'].includes(entryMethod)) return { error: 'Invalid medicine entry method.' };
  if (entryMethod === 'OCR' && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    return { error: 'OCR confidence must be between 0 and 1.' };
  }
  if (record?.patient_confirmed !== true) {
    return {
      error: `Review and confirm the medicine information for ${verifiedDrug.generic_name}.`,
    };
  }
  const endDate = String(record?.end_date || '').trim();
  if (
    endDate &&
    (!DATE_RE.test(endDate) ||
      Number.isNaN(Date.parse(`${endDate}T00:00:00Z`)) ||
      endDate < startDate)
  ) {
    return {
      error: `Choose an end date on or after the start date for ${verifiedDrug.generic_name}.`,
    };
  }
  let brandName = null;
  try {
    const brands =
      typeof verifiedDrug.brand_names_json === 'string'
        ? JSON.parse(verifiedDrug.brand_names_json)
        : verifiedDrug.brand_names_json;
    brandName = Array.isArray(brands) ? brands[0] || null : null;
  } catch {
    brandName = null;
  }
  return {
    value: {
      medicine_name: medicineName,
      brand_name: brandName,
      strength_value: strength.value,
      strength_unit: strength.unit,
      dosage_form: dosageForm,
      dosage_instruction: dosageInstruction,
      quantity_on_hand: quantity,
      quantity_unit: quantityUnit,
      start_date: startDate,
      end_date: endDate || null,
      label_direction: labelDirection || null,
      purpose:
        String(record?.purpose || '')
          .trim()
          .slice(0, 255) || null,
      release_type_snapshot:
        String(record?.release_type_snapshot || '')
          .trim()
          .slice(0, 80) || null,
      label_frequency: labelFrequency,
      label_food_instruction: labelFoodInstruction,
      entry_method: entryMethod,
      ocr_confidence: confidence,
      patient_confirmed: true,
      refill_reminders_enabled: record?.refill_reminders_enabled === true,
    },
  };
}
