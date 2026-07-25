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
});
