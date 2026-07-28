/**
 * Constraint checks — pure. (ENG §5 step 2, §3.2 undirected pairs.)
 *
 * Two constraints gate a candidate dose:
 *   (a) same-drug minimum interval  — no two doses of one drug closer than its floor
 *   (b) cross-drug interaction gap  — pharmacist-curated min_gap_hours between a pair
 *
 * Interaction pairs are undirected; we key them order-independently. The pair's
 * `type` maps to an effective gap so a single distance check covers every case:
 *   SPACING → min_gap_hours (shiftable)   MONITOR/NONE → 0 (co-schedulable)
 *   AVOID   → Infinity (never co-schedulable by spacing → forces UNRESOLVED)
 */

export function pairKey(a, b) {
  return String(a) < String(b) ? `${a}::${b}` : `${b}::${a}`;
}

export function buildInteractionMap(interactions = []) {
  const map = new Map();
  for (const it of interactions) {
    const type = it.type || 'SPACING';
    let gapMin;
    if (type === 'AVOID') gapMin = Infinity;
    else if (type === 'MONITOR' || type === 'NONE') gapMin = 0;
    else gapMin = Number(it.minGapHours) * 60;
    map.set(pairKey(it.drugAId, it.drugBId), {
      gapMin,
      type,
      minGapHours: it.minGapHours,
    });
  }
  return map;
}

/**
 * Test a candidate dose against already-placed doses.
 * @returns {{ok:true}} or {{ok:false, kind, otherDrug, otherTime, ...}}
 */
export function checkDose({ time, drugId, medId, minIntervalMin }, placed, interactionMap) {
  for (const p of placed) {
    const dist = Math.abs(time - p.minuteOfDay);

    if (p.medId === medId) {
      if (minIntervalMin && dist < minIntervalMin) {
        return {
          ok: false,
          kind: 'same-drug',
          otherDrug: p.drugName,
          otherTime: p.minuteOfDay,
          needMin: minIntervalMin,
        };
      }
      continue;
    }

    if (drugId && p.drugId) {
      const rec = interactionMap.get(pairKey(drugId, p.drugId));
      if (rec && dist < rec.gapMin) {
        return {
          ok: false,
          kind: 'interaction',
          otherDrug: p.drugName,
          otherTime: p.minuteOfDay,
          gapMin: rec.gapMin,
          minGapHours: rec.minGapHours,
          type: rec.type,
        };
      }
    }
  }
  return { ok: true };
}
