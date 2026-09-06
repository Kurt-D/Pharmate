import 'dotenv/config';
import mysql from 'mysql2/promise';

const FORM_TERMS = {
  tablet: ['TABLET', 'CAPLET'],
  capsule: ['CAPSULE'],
  syrup: ['SYRUP', 'LIQUID'],
  suspension: ['SUSPENSION'],
  cream: ['CREAM'],
  gel: ['GEL'],
  lotion: ['LOTION'],
  ointment: ['OINTMENT'],
  solution: ['SOLUTION'],
  'eye drops': ['OPHTHALMIC'],
  'ear drops': ['OTIC'],
  'nasal spray': ['NASAL', 'SPRAY'],
  'mouth rinse': ['MOUTHWASH', 'RINSE'],
  'mouthwash/spray': ['MOUTHWASH', 'SPRAY'],
  'effervescent tablet': ['TABLET'],
  'chewable tablet': ['CHEWABLE'],
};

function matchesForm(title, form) {
  const upper = String(title).toUpperCase();
  const normalized = String(form || '').toLowerCase();
  const terms = FORM_TERMS[normalized] || FORM_TERMS[normalized.split(' ').at(-1)] || [];
  return !terms.length || terms.some((term) => upper.includes(term));
}

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/hydrochloride|hcl|sodium|maleate|otic|ophthalmic|topical|\W/g, '');
function xmlIngredients(xml) {
  return [
    ...new Set(
      [
        ...xml.matchAll(
          /<ingredient classCode="ACTIB">[\s\S]*?<ingredientSubstance>[\s\S]*?<name>([^<]+)<\/name>/g
        ),
      ].map((match) => normalize(match[1]))
    ),
  ];
}
function exactIngredients(xml, name) {
  const found = xmlIngredients(xml);
  const expected = String(name).split('+').map(normalize).filter(Boolean);
  return (
    found.length === expected.length &&
    expected.every((item) => found.some((active) => active.includes(item) || item.includes(active)))
  );
}
function exactStrength(xml, strength) {
  const match = String(strength).match(/([\d,.]+)\s*(mg|mcg|g|units?|%)/i);
  if (!match) return false;
  const amount = match[1].replace(/,/g, '');
  const unit = match[2].toLowerCase().replace(/s$/, '');
  return [...xml.matchAll(/<numerator value="([^"]+)" unit="([^"]+)"/g)].some(
    (item) => String(item[1]) === amount && String(item[2]).toLowerCase().includes(unit)
  );
}
function exactForm(xml, form) {
  const terms = FORM_TERMS[String(form || '').toLowerCase()] || [];
  const codes = [...xml.matchAll(/<formCode[^>]+displayName="([^"]+)"/g)].map((match) =>
    match[1].toUpperCase()
  );
  return !terms.length || codes.some((code) => terms.some((term) => code.includes(term)));
}
async function validateCandidate(candidate, medicine) {
  if (!matchesForm(candidate.title, medicine.dosage_form)) return false;
  const response = await fetch(
    `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${candidate.setid}.xml`,
    { signal: globalThis.AbortSignal.timeout(20000) }
  );
  if (!response.ok) return false;
  const xml = await response.text();
  return (
    /displayName="Human OTC Drug Label"/i.test(xml) &&
    exactIngredients(xml, medicine.generic_name) &&
    exactStrength(xml, medicine.common_strength) &&
    exactForm(xml, medicine.dosage_form)
  );
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
});

let collected = 0;
let unresolved = 0;
try {
  const [medicines] = await connection.query(
    `SELECT evidence_id,drug_id,generic_name,common_strength,dosage_form
       FROM otc_rule_evidence_queue WHERE evidence_status='MISSING' ORDER BY generic_name`
  );
  for (const medicine of medicines) {
    const endpoint = new URL('https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json');
    endpoint.searchParams.set('drug_name', medicine.generic_name);
    endpoint.searchParams.set('pagesize', '20');
    try {
      let candidate = null;
      for (let page = 1; page <= 2 && !candidate; page++) {
        endpoint.searchParams.set('page', String(page));
        const response = await fetch(endpoint, { signal: globalThis.AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const likely = (payload.data || [])
          .filter((item) => matchesForm(item.title, medicine.dosage_form))
          .slice(0, 6);
        const checked = await Promise.all(
          likely.map(async (item) => ({ item, valid: await validateCandidate(item, medicine) }))
        );
        candidate = checked.find((entry) => entry.valid)?.item || null;
        if (page >= Number(payload.metadata?.total_pages || 1)) break;
      }
      if (!candidate) {
        unresolved++;
        continue;
      }
      const sourceUrl = `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${candidate.setid}`;
      const revision = new Date(candidate.published_date);
      const revisionDate = Number.isNaN(revision.valueOf())
        ? null
        : revision.toISOString().slice(0, 10);
      await connection.execute(
        `UPDATE otc_label_evidence
            SET product_name=?,source_authority='DailyMed candidate label',source_url=?,
                source_revision_date=?,evidence_status='COLLECTED',
                evidence_notes='Candidate found automatically. Strength, OTC category, Directions, age group, and formulation must match before activation.'
          WHERE id=? AND evidence_status='MISSING'`,
        [candidate.title, sourceUrl, revisionDate, medicine.evidence_id]
      );
      collected++;
    } catch (error) {
      unresolved++;
      console.warn(`${medicine.generic_name}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ searched: medicines.length, collected, unresolved }));
} finally {
  await connection.end();
}
