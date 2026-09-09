export const MEDICATION_STAGES = [
  'Medicine',
  'Directions',
  'Dates',
  'Reminder times',
  'Review',
  'Saved',
];
export function guidanceStage(phase, step) {
  if (phase === 'success') return 5;
  if (phase === 'review') return 4;
  if (phase === 'questions') return step <= 4 ? 0 : step <= 7 ? 1 : 2;
  if (phase === 'edit-details') return 1;
  return 3;
}
export function medicineIssues(medicine, endDate) {
  if (!medicine)
    return [
      {
        code: 'MEDICINE_REQUIRED',
        label: 'Choose medicine',
        step: 1,
        message: 'Choose the medicine shown on your label.',
      },
    ];
  const issues = [];
  if (!(Number(medicine.strength_value) > 0) || !medicine.strength_unit)
    issues.push({
      code: 'STRENGTH_REQUIRED',
      label: 'Check strength',
      step: 3,
      message: 'Check the strength and unit printed on the label.',
    });
  if (!medicine.frequency_code)
    issues.push({
      code: 'FREQUENCY_REQUIRED',
      label: 'Review directions',
      step: 6,
      message: 'Choose how often the label says to take this medicine.',
    });
  if (!(Number(medicine.dose_amount) > 0))
    issues.push({
      code: 'DOSE_REQUIRED',
      label: 'Check dose',
      step: 7,
      message: 'Check how much medicine the label says to take at one time.',
    });
  if (!medicine.start_date || (endDate && endDate < medicine.start_date))
    issues.push({
      code: 'DATES_REQUIRED',
      label: 'Choose dates',
      step: 8,
      message: 'Review the treatment dates. The end cannot be before the start.',
    });
  return issues;
}
