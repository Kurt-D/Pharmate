/**
 * Schedule engine fixture tests — the eight worked examples of ENG §11 become
 * golden tests, plus the determinism property of ENG §9/§12.
 *
 * Examples 1–6 exercise the pure engine directly (placement, PRN, reflow).
 * Example 7 (unknown drug) is asserted here at the engine boundary AND end-to-end
 * in src/__tests__/medications.test.js (202 pending_drug). Example 8 (restricted
 * substance) is enforced upstream at encode time — see medications.test.js
 * ("restricted → 403 visit_nearest_branch"), since restricted drugs never reach
 * the engine. Both cross-references are noted below.
 */

import { generateSchedule, checkPrnDose, reflowRemaining } from '../index.js';
import { parseClock } from '../time.js';

const ANCHORS = {
  wake: '08:00',
  sleep: '22:00',
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '19:00',
};

// Stable drug ids for interaction wiring.
const PARA = 'drug-paracetamol';
const IBU = 'drug-ibuprofen';
const LOSARTAN = 'drug-losartan';
const AMOX = 'drug-amoxicillin';

function times(result) {
  return result.slots.map((s) => s.time);
}

describe('ENG §11 example 1 — TID conversion (Amoxicillin)', () => {
  test('TID from 08:00 wake → 08:00, 16:00, 00:00 with reasons', () => {
    const out = generateSchedule({
      anchors: ANCHORS,
      medications: [
        {
          id: 'm1',
          drugId: AMOX,
          drugName: 'Amoxicillin',
          frequencyCode: 'TID',
          minIntervalHours: 8,
          maxDailyDoses: 3,
        },
      ],
      interactions: [],
    });

    expect(times(out)).toEqual(['08:00', '16:00', '00:00']);
    expect(out.slots[2].dayOffset).toBe(1); // 00:00 is next day
    expect(out.unresolved).toHaveLength(0);
    out.slots.forEach((s) => expect(s.reason).toMatch(/TID \(q8h\)/));
  });
});

describe('ENG §11 example 2 — gap enforcement (Paracetamol q4h + Ibuprofen TID)', () => {
  test('ibuprofen anchor slides 08:00 → 09:00, whole train follows, no pair within 60 min', () => {
    const out = generateSchedule({
      anchors: ANCHORS,
      medications: [
        {
          id: 'm-ibu',
          drugId: IBU,
          drugName: 'Ibuprofen',
          frequencyCode: 'TID',
          minIntervalHours: 8,
          maxDailyDoses: 3,
        },
        {
          id: 'm-para',
          drugId: PARA,
          drugName: 'Paracetamol',
          frequencyCode: 'q4h',
          minIntervalHours: 4,
          maxDailyDoses: 8,
        },
      ],
      interactions: [{ drugAId: PARA, drugBId: IBU, minGapHours: 1, type: 'SPACING' }],
    });

    const para = out.slots.filter((s) => s.drugName === 'Paracetamol').map((s) => s.time);
    const ibu = out.slots.filter((s) => s.drugName === 'Ibuprofen').map((s) => s.time);

    expect(para).toEqual(['08:00', '12:00', '16:00', '20:00', '00:00', '04:00']);
    expect(ibu).toEqual(['09:00', '17:00', '01:00']);
    expect(out.unresolved).toHaveLength(0);

    // No paracetamol/ibuprofen dose pair falls within 60 minutes.
    const paraMin = out.slots.filter((s) => s.drugName === 'Paracetamol').map((s) => s.minuteOfDay);
    const ibuMin = out.slots.filter((s) => s.drugName === 'Ibuprofen').map((s) => s.minuteOfDay);
    for (const a of paraMin)
      for (const b of ibuMin) expect(Math.abs(a - b)).toBeGreaterThanOrEqual(60);

    // Shift reason names the colliding pair.
    expect(out.slots.find((s) => s.drugName === 'Ibuprofen').reason).toMatch(
      /shift to honor 1h gap vs Paracetamol/
    );
  });
});

describe('ENG §11 example 3 — 1-0-1 meal anchoring (Losartan)', () => {
  test('MEALMAP(1,0,1):PC keeps the verified 12-hour internal gap', () => {
    const out = generateSchedule({
      anchors: ANCHORS,
      medications: [
        {
          id: 'm1',
          drugId: LOSARTAN,
          drugName: 'Losartan',
          frequencyCode: 'MEALMAP(1,0,1):PC',
          minIntervalHours: 12,
        },
      ],
      interactions: [],
    });

    expect(times(out)).toEqual(['07:30', '19:30']);
    expect(out.slots[0].reason).toMatch(/after breakfast/);
    expect(out.slots[1].reason).toMatch(/after dinner/);
    expect(out.slots[1].minuteOfDay - out.slots[0].minuteOfDay).toBeGreaterThanOrEqual(12 * 60);
    expect(out.unresolved).toHaveLength(0);
  });
});

describe('CSP solver metadata and hard-constraint validation', () => {
  test('returns deterministic solver evidence with no prescribed-count changes', () => {
    const input = {
      anchors: ANCHORS,
      medications: [
        { id: 'csp-a', drugId: PARA, drugName: 'Medicine A', frequencyCode: 'q8h', minIntervalHours: 8, maxDailyDoses: 3 },
        { id: 'csp-b', drugId: IBU, drugName: 'Medicine B', frequencyCode: 'BID', minIntervalHours: 12, maxDailyDoses: 2 },
      ],
      interactions: [{ drugAId: PARA, drugBId: IBU, minGapHours: 2, type: 'SPACING' }],
    };
    const first = generateSchedule(input);
    const second = generateSchedule(input);
    expect(first).toEqual(second);
    expect(first.solver.algorithm).toBe('CSP_RULE_ANCHOR_V2');
    expect(first.solver.complete).toBe(true);
    expect(first.slots.filter((item) => item.medicationId === 'csp-a')).toHaveLength(3);
    expect(first.slots.filter((item) => item.medicationId === 'csp-b')).toHaveLength(2);
  });
});

describe('ENG §11 example 4 — elderly polypharmacy', () => {
  test('8 maintenance meds + 2 PRN → full-day layout, zero violations', () => {
    const meds = [
      {
        id: 'p1',
        drugId: 'd-amlodipine',
        drugName: 'Amlodipine',
        frequencyCode: 'QD',
        minIntervalHours: 24,
      },
      {
        id: 'p2',
        drugId: 'd-losartan',
        drugName: 'Losartan',
        frequencyCode: 'MEALMAP(1,0,1)',
        minIntervalHours: 12,
      },
      {
        id: 'p3',
        drugId: 'd-metformin',
        drugName: 'Metformin',
        frequencyCode: 'BID',
        minIntervalHours: 12,
      },
      {
        id: 'p4',
        drugId: 'd-gliclazide',
        drugName: 'Gliclazide',
        frequencyCode: 'QD',
        minIntervalHours: 24,
      },
      {
        id: 'p5',
        drugId: 'd-atorvastatin',
        drugName: 'Atorvastatin',
        frequencyCode: 'HS',
        minIntervalHours: 24,
      },
      {
        id: 'p6',
        drugId: 'd-aspirin',
        drugName: 'Aspirin',
        frequencyCode: 'QD',
        minIntervalHours: 24,
      },
      {
        id: 'p7',
        drugId: 'd-omeprazole',
        drugName: 'Omeprazole',
        frequencyCode: 'QD',
        minIntervalHours: 24,
      },
      {
        id: 'p8',
        drugId: 'd-amoxicillin',
        drugName: 'Amoxicillin',
        frequencyCode: 'TID',
        minIntervalHours: 8,
      },
      {
        id: 'p9',
        drugId: 'd-paracetamol',
        drugName: 'Paracetamol',
        frequencyCode: 'PRN',
        isPrn: true,
        minIntervalHours: 4,
        maxDailyDoses: 8,
      },
      {
        id: 'p10',
        drugId: 'd-ibuprofen',
        drugName: 'Ibuprofen',
        frequencyCode: 'PRN',
        isPrn: true,
        minIntervalHours: 6,
        maxDailyDoses: 4,
      },
    ];

    const out = generateSchedule({ anchors: ANCHORS, medications: meds, interactions: [] });

    expect(out.prn).toHaveLength(2); // the two PRN drugs are listed, never scheduled
    expect(out.slots.every((s) => s.isPrn === false)).toBe(true);
    expect(out.unresolved).toHaveLength(0);
    // Every placed dose has a non-empty audit reason (ENG §9).
    out.slots.forEach((s) =>
      expect(typeof s.reason === 'string' && s.reason.length > 0).toBe(true)
    );
  });
});

describe('ENG §11 example 5 — late intake reflow', () => {
  test('Paracetamol q4h 08:00 taken 09:30 → 13:30, 17:30, 21:30; 01:30 dropped', () => {
    const out = reflowRemaining({
      intervalHours: 4,
      takenTimeMin: parseClock('09:30'),
      sleepAnchorMin: parseClock('22:00'),
    });

    expect(out.kept.map((d) => d.time)).toEqual(['13:30', '17:30', '21:30']);
    expect(out.dropped).toHaveLength(1);
    expect(out.dropped[0].time).toBe('01:30');
    expect(out.dropped[0].reason).toMatch(/insufficient safe interval/);
  });
});

describe('ENG §11 example 6 — PRN block', () => {
  test('scheduled paracetamol taken 12:00; PRN ibuprofen 12:20 → blocked, countdown to 13:00', () => {
    const res = checkPrnDose({
      attemptTimeMin: parseClock('12:20'),
      drugId: IBU,
      minIntervalHours: 6,
      maxDailyDoses: 4,
      lastDoseMin: null,
      dosesToday: 0,
      recentDoses: [{ minuteOfDay: parseClock('12:00'), drugId: PARA, drugName: 'Paracetamol' }],
      interactions: [{ drugAId: PARA, drugBId: IBU, minGapHours: 1, type: 'SPACING' }],
    });

    expect(res.allowed).toBe(false);
    expect(res.earliestSafeTime).toBe('13:00');
    expect(res.blockingDrug).toBe('Paracetamol');
  });

  test('PRN allowed once the gap has elapsed (12:20 → attempt 13:05)', () => {
    const res = checkPrnDose({
      attemptTimeMin: parseClock('13:05'),
      drugId: IBU,
      minIntervalHours: 6,
      recentDoses: [{ minuteOfDay: parseClock('12:00'), drugId: PARA, drugName: 'Paracetamol' }],
      interactions: [{ drugAId: PARA, drugBId: IBU, minGapHours: 1, type: 'SPACING' }],
    });
    expect(res.allowed).toBe(true);
  });

  test('PRN blocked by daily maximum (cap reached, no countdown)', () => {
    const res = checkPrnDose({
      attemptTimeMin: parseClock('20:00'),
      drugId: IBU,
      minIntervalHours: 6,
      maxDailyDoses: 4,
      dosesToday: 4,
    });
    expect(res.allowed).toBe(false);
    expect(res.capReached).toBe(true);
  });
});

describe('ENG §11 example 7 — unknown drug (uncurated)', () => {
  test('a medication with no curated drugId is UNRESOLVED, not scheduled', () => {
    // End-to-end 202 pending_drug is covered in src/__tests__/medications.test.js.
    const out = generateSchedule({
      anchors: ANCHORS,
      medications: [
        { id: 'mx', drugId: null, drugName: 'Investigational-X', frequencyCode: 'BID' },
      ],
      interactions: [],
    });
    expect(out.slots).toHaveLength(0);
    expect(out.unresolved).toHaveLength(1);
    expect(out.unresolved[0].reason).toMatch(/awaiting pharmacist verification/);
  });
});

// Example 8 (restricted substance → "visit nearest branch") is enforced at encode
// time before a Medication row ever exists; it is asserted in medications.test.js.

describe('unrecognized frequency routes to CONSULT, never guessed (ENG §4)', () => {
  test('frequencyCode CONSULT → unresolved with consult message', () => {
    const out = generateSchedule({
      anchors: ANCHORS,
      medications: [{ id: 'mc', drugId: 'd-x', drugName: 'MysteryDrug', frequencyCode: 'CONSULT' }],
      interactions: [],
    });
    expect(out.unresolved[0].reason).toMatch(/consult your pharmacist/);
  });
});

describe('ENG §9/§12 — determinism property (shuffle input ⇒ identical output)', () => {
  const meds = [
    { id: 'a', drugId: 'd-a', drugName: 'Amlodipine', frequencyCode: 'QD', minIntervalHours: 24 },
    { id: 'b', drugId: 'd-b', drugName: 'Metformin', frequencyCode: 'BID', minIntervalHours: 12 },
    { id: 'c', drugId: 'd-c', drugName: 'Amoxicillin', frequencyCode: 'TID', minIntervalHours: 8 },
    {
      id: 'd',
      drugId: 'd-d',
      drugName: 'Paracetamol',
      frequencyCode: 'q4h',
      minIntervalHours: 4,
      maxDailyDoses: 8,
    },
    { id: 'e', drugId: 'd-e', drugName: 'Ibuprofen', frequencyCode: 'TID', minIntervalHours: 8 },
    {
      id: 'f',
      drugId: 'd-f',
      drugName: 'Losartan',
      frequencyCode: 'MEALMAP(1,0,1):PC',
      minIntervalHours: 12,
    },
    { id: 'g', drugId: 'd-g', drugName: 'Atorvastatin', frequencyCode: 'HS', minIntervalHours: 24 },
  ];
  const interactions = [
    { drugAId: 'd-d', drugBId: 'd-e', minGapHours: 1, type: 'SPACING' },
    { drugAId: 'd-c', drugBId: 'd-e', minGapHours: 2, type: 'SPACING' },
  ];

  function shuffle(arr, seed) {
    // Deterministic LCG shuffle so the test itself is reproducible.
    const a = [...arr];
    let s = seed;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  test('≥100 shuffles produce byte-identical JSON output', () => {
    const canonical = JSON.stringify(
      generateSchedule({ anchors: ANCHORS, medications: meds, interactions })
    );
    for (let seed = 1; seed <= 120; seed++) {
      const shuffled = shuffle(meds, seed);
      const out = JSON.stringify(
        generateSchedule({ anchors: ANCHORS, medications: shuffled, interactions })
      );
      expect(out).toBe(canonical);
    }
  });
});
