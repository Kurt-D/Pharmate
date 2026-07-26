import { parseFrequency } from '../frequencyParser.js';

describe('parseFrequency', () => {
  // Standard abbreviations
  test.each([
    ['QD', 'QD'],
    ['BID', 'BID'],
    ['TID', 'TID'],
    ['QID', 'QID'],
    ['q8h', 'q8h'],
    ['q12h', 'q12h'],
    ['PRN', 'PRN'],
  ])('parses %s -> %s (case-insensitive)', (input, expected) => {
    expect(parseFrequency(input.toLowerCase())).toBe(expected);
    expect(parseFrequency(input.toUpperCase())).toBe(expected);
  });

  // Natural language
  test('three times daily -> TID', () => {
    expect(parseFrequency('three times daily')).toBe('TID');
  });

  test('twice a day -> BID', () => {
    expect(parseFrequency('twice a day')).toBe('BID');
  });

  test('every 8 hours -> q8h', () => {
    expect(parseFrequency('every 8 hours')).toBe('q8h');
  });

  // Meal anchoring
  test('with breakfast and dinner -> MEALMAP(1,0,1)', () => {
    expect(parseFrequency('with breakfast and dinner')).toBe('MEALMAP(1,0,1)');
  });

  test('with breakfast and lunch and dinner -> MEALMAP(1,1,1)', () => {
    expect(parseFrequency('with breakfast and lunch and dinner')).toBe('MEALMAP(1,1,1)');
  });

  // Unrecognized inputs must route to CONSULT, never guessed
  test.each([
    [''],
    [null],
    [undefined],
    ['stat'],
    ['weekly'],
    ['every other day'],
    ['gibberish frequency'],
  ])('unrecognized input %p -> CONSULT', (input) => {
    expect(parseFrequency(input)).toBe('CONSULT');
  });

  // PRN
  test('as needed -> PRN', () => {
    expect(parseFrequency('as needed')).toBe('PRN');
  });

  // ── ENG §4 additions (Sprint 3) ────────────────────────────────────────────

  // Generic strict interval
  test.each([
    ['q6h', 'q6h'],
    ['q10h', 'q10h'],
    ['every 6 hours', 'q6h'],
    ['every 3 hrs', 'q3h'],
  ])('generic interval %s -> %s', (input, expected) => {
    expect(parseFrequency(input)).toBe(expected);
  });

  // Bedtime
  test.each([['HS'], ['at bedtime'], ['before bed'], ['nightly']])('bedtime %s -> HS', (input) => {
    expect(parseFrequency(input)).toBe('HS');
  });

  // 1-0-1 meal notation
  test.each([
    ['1-0-1', 'MEALMAP(1,0,1)'],
    ['1-1-1', 'MEALMAP(1,1,1)'],
    ['0-0-1', 'MEALMAP(0,0,1)'],
  ])('meal notation %s -> %s', (input, expected) => {
    expect(parseFrequency(input)).toBe(expected);
  });

  // Meal modifiers (AC/PC)
  test('1-0-1 after meals -> MEALMAP(1,0,1):PC', () => {
    expect(parseFrequency('1-0-1 after meals')).toBe('MEALMAP(1,0,1):PC');
  });

  test('TID after meals -> MEALMAP(1,1,1):PC (ENG §4 word+modifier rule)', () => {
    expect(parseFrequency('TID after meals')).toBe('MEALMAP(1,1,1):PC');
  });

  test('once daily before meals -> MEALMAP(1,0,0):AC', () => {
    expect(parseFrequency('once daily before meals')).toBe('MEALMAP(1,0,0):AC');
  });

  // At least 10 malformed inputs must route to CONSULT, never guessed (AC).
  test.each([
    [''],
    [null],
    [undefined],
    ['stat'],
    ['weekly'],
    ['every other day'],
    ['gibberish frequency'],
    ['q99h'],
    ['2-2-2'],
    ['whenever'],
    ['after meals'],
    ['every few hours'],
  ])('malformed input %p -> CONSULT', (input) => {
    expect(parseFrequency(input)).toBe('CONSULT');
  });
});
