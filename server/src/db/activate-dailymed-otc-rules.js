import 'dotenv/config';
import mysql from 'mysql2/promise';

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4 };
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
  'effervescent tablet': ['TABLET'],
  'chewable tablet': ['CHEWABLE'],
  'powder for solution': ['POWDER'],
  'mouth rinse': ['MOUTHWASH', 'RINSE'],
  'mouthwash/spray': ['MOUTHWASH', 'SPRAY'],
};
const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/hydrochloride|hcl|sodium|maleate|otic|ophthalmic|topical|\W/g, '');
const decode = (value) =>
  String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
const setId = (url) => new URL(url).searchParams.get('setid');
function section(xml, code) {
  const blocks = xml.match(/<section\b[^>]*>[\s\S]*?<\/section>/g) || [];
  return decode(blocks.find((block) => block.includes(`code="${code}"`)) || '');
}
function frequency(text) {
  const lower = text.toLowerCase();
  if (/as needed|while symptoms persist|after each|after the first|when symptoms/.test(lower))
    return null;
  const named = [
    [/\bonce (?:a |per )?day|\bone time daily|\bonce daily/, 'QD', 1, 24],
    [/\btwice (?:a |per )?day|\btwo times daily|\btwice daily/, 'BID', 2, 12],
    [/\b(?:three|3) times (?:a |per )?day|\b(?:three|3) times daily/, 'TID', 3, 8],
    [/\b(?:four|4) times (?:a |per )?day|\b(?:four|4) times daily/, 'QID', 4, 6],
  ];
  for (const [pattern, code, daily, interval] of named)
    if (pattern.test(lower)) return { code, daily, interval };
  const exact = lower.match(/every\s+(\d{1,2})\s+hours?(?!\s*(?:to|-|or))/);
  if (exact) {
    const hours = Number(exact[1]);
    if (hours > 0 && 24 % hours === 0)
      return { code: `Q${hours}H`, daily: 24 / hours, interval: hours };
  }
  return null;
}
function dose(text) {
  const match = text
    .toLowerCase()
    .match(/\b(?:take|apply|instill|use)\s+(\d+(?:\.\d+)?|one|two|three|four)\b/);
  return match ? Number(WORD_NUMBERS[match[1]] || match[1]) : 1;
}
function route(form) {
  const value = String(form).toLowerCase();
  if (value.includes('eye')) return 'OPHTHALMIC';
  if (value.includes('ear')) return 'OTIC';
  if (value.includes('nasal')) return 'NASAL';
  if (/cream|gel|lotion|ointment|topical/.test(value)) return 'TOPICAL';
  if (/mouth/.test(value)) return 'ORAL_TOPICAL';
  return 'ORAL';
}
function formMatches(xml, form) {
  const terms = FORM_TERMS[String(form || '').toLowerCase()] || [];
  const codes = [...xml.matchAll(/<formCode[^>]+displayName="([^"]+)"/g)].map((m) =>
    m[1].toUpperCase()
  );
  return !terms.length || codes.some((code) => terms.some((term) => code.includes(term)));
}
function ingredients(xml) {
  return [
    ...new Set(
      [
        ...xml.matchAll(
          /<ingredient classCode="ACTIB">[\s\S]*?<ingredientSubstance>[\s\S]*?<name>([^<]+)<\/name>/g
        ),
      ].map((m) => normalize(m[1]))
    ),
  ];
}
function ingredientsMatch(xml, name) {
  const found = ingredients(xml);
  const expected = String(name).split('+').map(normalize).filter(Boolean);
  return (
    found.length === expected.length &&
    expected.every((item) => found.some((active) => active.includes(item) || item.includes(active)))
  );
}
function strengthMatches(xml, strength) {
  const match = String(strength).match(/([\d,.]+)\s*(mg|mcg|g|units?|%)/i);
  if (!match) return false;
  const amount = match[1].replace(/,/g, '');
  const unit = match[2].toLowerCase();
  return [...xml.matchAll(/<numerator value="([^"]+)" unit="([^"]+)"/g)].some(
    (m) =>
      String(m[1]) === amount &&
      String(m[2]).toLowerCase().replace(/[{}]/g, '').includes(unit.replace(/s$/, ''))
  );
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3307,
  database: process.env.DB_NAME || 'pharmate',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
});
const stats = { checked: 0, activated: 0, rejected: 0, nonFixed: 0 };
try {
  const [rows] = await connection.query(
    `SELECT * FROM otc_rule_evidence_queue WHERE evidence_status='COLLECTED' ORDER BY generic_name`
  );
  for (const item of rows) {
    stats.checked++;
    try {
      const id = setId(item.source_url);
      if (!id) throw new Error('DailyMed set ID is missing');
      const response = await fetch(
        `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${id}.xml`,
        { signal: globalThis.AbortSignal.timeout(20000) }
      );
      if (!response.ok) throw new Error(`DailyMed HTTP ${response.status}`);
      const xml = await response.text();
      if (!/displayName="Human OTC Drug Label"/i.test(xml))
        throw new Error('Candidate is not an OTC Drug Facts label');
      if (!ingredientsMatch(xml, item.generic_name))
        throw new Error('Active ingredients do not exactly match the catalog medicine');
      if (!formMatches(xml, item.dosage_form)) throw new Error('Dosage form does not match');
      if (!strengthMatches(xml, item.common_strength)) throw new Error('Strength does not match');
      const directions = section(xml, '34068-7');
      if (!directions) throw new Error('Directions section was not found');
      const parsed = frequency(directions);
      if (!parsed) {
        stats.nonFixed++;
        await connection.execute(
          `UPDATE otc_label_evidence SET directions_text=?,schedule_type='PRN_TRACKER',evidence_status='COLLECTED',reviewed_at=NULL,evidence_notes='Official directions are symptom-based or variable. An administrator must prepare the PRN tracker rule and a pharmacist must verify its safety evidence.' WHERE id=?`,
          [directions, item.evidence_id]
        );
        continue;
      }
      const food = /before (?:eating|a meal)|empty stomach/i.test(directions)
        ? 'BEFORE_MEAL'
        : /with (?:food|a meal)/i.test(directions)
          ? 'WITH_MEAL'
          : /after (?:food|a meal)/i.test(directions)
            ? 'AFTER_MEAL'
            : 'NONE';
      const release = /delayed.release/i.test(xml)
        ? 'DELAYED_RELEASE'
        : /extended.release/i.test(xml)
          ? 'EXTENDED_RELEASE'
          : route(item.dosage_form) === 'ORAL'
            ? 'IMMEDIATE_RELEASE'
            : 'NOT_APPLICABLE';
      const units = dose(directions);
      const today = new Date().toISOString().slice(0, 10);
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE otc_label_evidence SET directions_text=?,schedule_type=?,frequency_code=?,units_per_dose=?,min_interval_hours=?,max_daily_doses=?,food_rule=?,evidence_status='COLLECTED',evidence_notes='Exact label fields were collected automatically. Administrator preparation and pharmacist verification are still required.',reviewed_at=NULL WHERE id=?`,
        [
          directions,
          food === 'NONE' ? 'FIXED_DAILY' : 'MEAL_ANCHORED',
          parsed.code,
          units,
          parsed.interval,
          parsed.daily,
          food,
          item.evidence_id,
        ]
      );
      await connection.execute(
        `UPDATE drug_reference SET catalog_status='VERIFIED',clinical_rule_status='UNVERIFIED',administration_route=?,release_type=?,supported_frequency_codes=JSON_ARRAY(?),frequency_default=?,min_interval_hours=?,max_daily_doses=?,default_units_per_dose=?,food_rule=?,administration_instruction=?,clinical_rationale='Candidate schedule fields were collected from an exact single-ingredient DailyMed OTC Drug Facts label and require review.',guidance_do='Confirm that the displayed product and directions match the package before saving.',guidance_dont='Do not exceed the label dose or use this rule for a different strength, form, age group, or combination product.',evidence_source_url=?,clinical_source_name=?,source_revision_date=?,evidence_reviewed_at=?,rule_version=rule_version+1,is_provisional=1 WHERE id=?`,
        [
          route(item.dosage_form),
          release,
          parsed.code,
          parsed.code,
          parsed.interval,
          parsed.daily,
          units,
          food,
          directions,
          item.source_url,
          `DailyMed OTC Drug Facts — ${item.product_name}`,
          item.source_revision_date,
          today,
          item.drug_id,
        ]
      );
      await connection.commit();
      stats.activated++;
    } catch (error) {
      await connection.rollback().catch(() => {});
      stats.rejected++;
      await connection.execute(
        `UPDATE otc_label_evidence SET evidence_status='MISSING',evidence_notes=? WHERE id=?`,
        [`Candidate rejected: ${error.message}`.slice(0, 500), item.evidence_id]
      );
    }
  }
  console.log(JSON.stringify(stats));
} finally {
  await connection.end();
}
