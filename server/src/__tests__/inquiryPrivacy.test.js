import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { subscribeRealtime } from '../services/realtimeEvents.js';
import {
  createAccessToken,
  createPatientTestUser,
  createPrivilegedTestUser,
} from './helpers/testUsers.js';
import { INQUIRY_PRIVACY_VERSION } from '../../../shared/inquiryPrivacy.mjs';

const password = 'TestPass@123';
const stamp = uuidv4();
const auth = (token) => ({ Authorization: `Bearer ${token}` });
let patient;
let anotherPatient;
let pharmacist;
let branchColleague;
let otherBranchPharmacist;
let caregiver;
let branchId;
let otherBranchId;
let patientCode;

async function makeUser(role, label) {
  const options = { email: `${label}.${stamp}@test.pharmate`, password, role, fullName: label };
  const id =
    role === 'patient'
      ? await createPatientTestUser(options)
      : await createPrivilegedTestUser(options);
  return { id, token: await createAccessToken(id) };
}

async function accept(user = patient) {
  const result = await request(app)
    .post('/api/patient/inquiry-consent')
    .set(auth(user.token))
    .send({ accepted: true, policy_version: INQUIRY_PRIVACY_VERSION });
  expect(result.status).toBe(200);
  return result.body;
}

async function open(extra = {}) {
  const result = await request(app)
    .post('/api/patient/inquiries')
    .set(auth(patient.token))
    .send({ subject: 'Privacy test inquiry', branch_id: branchId, ...extra });
  expect(result.status).toBe(201);
  return result.body.thread_id;
}

beforeAll(async () => {
  patient = await makeUser('patient', 'inquiry-consent-patient');
  anotherPatient = await makeUser('patient', 'inquiry-consent-other-patient');
  pharmacist = await makeUser('pharmacist', 'inquiry-consent-pharmacist');
  branchColleague = await makeUser('pharmacist', 'inquiry-consent-colleague');
  otherBranchPharmacist = await makeUser('pharmacist', 'inquiry-consent-other-branch');
  caregiver = await makeUser('caregiver', 'inquiry-consent-caregiver');
  branchId = uuidv4();
  otherBranchId = uuidv4();
  await pool.execute(
    "INSERT INTO pharmacy_branches (id,name,address) VALUES (?,'Privacy Branch','Test'),(?,'Other Privacy Branch','Test')",
    [branchId, otherBranchId]
  );
  await pool.execute('UPDATE pharmacists SET branch_id=? WHERE id IN (?,?)', [
    branchId,
    pharmacist.id,
    branchColleague.id,
  ]);
  await pool.execute('UPDATE pharmacists SET branch_id=? WHERE id=?', [
    otherBranchId,
    otherBranchPharmacist.id,
  ]);
  const [[row]] = await pool.execute('SELECT patient_code FROM patients WHERE id=?', [patient.id]);
  patientCode = row.patient_code;
  await pool.execute(
    "INSERT INTO caregiver_patients (id,caregiver_id,patient_id,status) VALUES (?,?,?,'active')",
    [uuidv4(), caregiver.id, patient.id]
  );
});

afterAll(async () => {
  await pool.end();
});

test('a missing, declined, or outdated consent cannot create an inquiry or consent event', async () => {
  const state = await request(app).get('/api/patient/inquiry-consent').set(auth(patient.token));
  expect(state.status).toBe(200);
  expect(state.headers['cache-control']).toBe('no-store');
  expect(state.body).toEqual({
    consented: false,
    policy_version: INQUIRY_PRIVACY_VERSION,
    accepted_at: null,
    revoked_at: null,
  });
  for (const body of [
    {},
    { accepted: false, policy_version: INQUIRY_PRIVACY_VERSION },
    { accepted: true, policy_version: 'outdated-policy' },
  ]) {
    const consent = await request(app)
      .post('/api/patient/inquiry-consent')
      .set(auth(patient.token))
      .send(body);
    expect(consent.status).toBe(403);
    expect(consent.body.error).toBe('inquiry_consent_required');
  }
  const inquiry = await request(app)
    .post('/api/patient/inquiries')
    .set(auth(patient.token))
    .send({ subject: 'Must not persist', branch_id: branchId });
  expect(inquiry.status).toBe(403);
  expect(inquiry.body.error).toBe('inquiry_consent_required');
  const [[events]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM inquiry_consent_events WHERE patient_id=?',
    [patient.id]
  );
  const [[threads]] = await pool.execute(
    'SELECT COUNT(*) AS count FROM inquiry_threads WHERE patient_id=?',
    [patient.id]
  );
  expect(events.count).toBe(0);
  expect(threads.count).toBe(0);
});

test('a linked caregiver cannot grant patient consent or bypass the inquiry gate', async () => {
  const grant = await request(app)
    .post('/api/patient/inquiry-consent')
    .set(auth(caregiver.token))
    .send({ accepted: true, policy_version: INQUIRY_PRIVACY_VERSION, patient_id: patient.id });
  expect(grant.status).toBe(403);
  const inquiry = await request(app)
    .post(`/api/caregiver/patients/${patientCode}/inquiries`)
    .set(auth(caregiver.token))
    .send({
      subject: 'No delegated consent',
      branch_id: branchId,
      accepted: true,
      policy_version: INQUIRY_PRIVACY_VERSION,
    });
  expect(inquiry.status).toBe(403);
  expect(inquiry.body.error).toBe('inquiry_consent_required');
});

test('explicit acceptance is versioned, idempotent, and snapshotted on each new thread', async () => {
  const consent = await accept();
  expect(consent.consented).toBe(true);
  expect(consent.accepted_at).toBeTruthy();
  const again = await accept();
  expect(again.accepted_at).toBe(consent.accepted_at);
  const id = await open();
  const [[thread]] = await pool.execute(
    'SELECT consent_policy_version,consent_accepted_at FROM inquiry_threads WHERE id=?',
    [id]
  );
  expect(thread.consent_policy_version).toBe(INQUIRY_PRIVACY_VERSION);
  expect(new Date(thread.consent_accepted_at).toISOString()).toBe(consent.accepted_at);
  const [events] = await pool.execute(
    'SELECT actor_user_id,action,policy_version,occurred_at FROM inquiry_consent_events WHERE patient_id=?',
    [patient.id]
  );
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    actor_user_id: patient.id,
    action: 'ACCEPTED',
    policy_version: INQUIRY_PRIVACY_VERSION,
  });
  expect(events[0].occurred_at).toBeTruthy();
});

test('outdated saved consent cannot authorize new threads or messages', async () => {
  const id = await open();
  await pool.execute('UPDATE patients SET inquiry_consent_policy_version=? WHERE id=?', [
    'previous-policy',
    patient.id,
  ]);
  const state = await request(app).get('/api/patient/inquiry-consent').set(auth(patient.token));
  expect(state.body.consented).toBe(false);
  const create = await request(app)
    .post('/api/patient/inquiries')
    .set(auth(patient.token))
    .send({ subject: 'Stale consent' });
  const append = await request(app)
    .post(`/api/patient/inquiries/${id}/messages`)
    .set(auth(patient.token))
    .send({ message: 'Stale message' });
  expect([create.status, append.status]).toEqual([403, 403]);
  expect(append.body.error).toBe('inquiry_consent_required');
  await accept();
});

test('branch and selected-pharmacist eligibility apply to queue, reads, replies, and claims', async () => {
  const id = await open();
  const queue = await request(app)
    .get('/api/pharmacist/inquiries')
    .set(auth(otherBranchPharmacist.token));
  expect(queue.body.some((row) => row.id === id)).toBe(false);
  const denied = await Promise.all([
    request(app)
      .get(`/api/pharmacist/inquiries/${id}/messages`)
      .set(auth(otherBranchPharmacist.token)),
    request(app)
      .post(`/api/pharmacist/inquiries/${id}/reply`)
      .set(auth(otherBranchPharmacist.token))
      .send({ message: 'Cross-branch reply' }),
    request(app)
      .post(`/api/pharmacist/inquiries/${id}/accept`)
      .set(auth(otherBranchPharmacist.token)),
  ]);
  expect(denied.map((res) => res.status)).toEqual([404, 404, 404]);
  const selectedId = await open({ pharmacist_id: pharmacist.id });
  const colleagueQueue = await request(app)
    .get('/api/pharmacist/inquiries')
    .set(auth(branchColleague.token));
  expect(colleagueQueue.body.some((row) => row.id === selectedId)).toBe(false);
  const selectedRead = await request(app)
    .get(`/api/pharmacist/inquiries/${selectedId}/messages`)
    .set(auth(branchColleague.token));
  expect(selectedRead.status).toBe(404);
  const allowed = await request(app)
    .post(`/api/pharmacist/inquiries/${id}/accept`)
    .set(auth(pharmacist.token));
  expect(allowed.status).toBe(200);
  const claimed = await request(app)
    .get(`/api/pharmacist/inquiries/${id}/messages`)
    .set(auth(branchColleague.token));
  expect(claimed.status).toBe(404);
});

test('withdrawal stops both message directions and caregiver creation while preserving history and closure', async () => {
  const id = await open();
  await request(app)
    .post(`/api/patient/inquiries/${id}/messages`)
    .set(auth(patient.token))
    .send({ message: 'Retained consultation text' })
    .expect(201);
  await request(app)
    .post(`/api/pharmacist/inquiries/${id}/accept`)
    .set(auth(pharmacist.token))
    .expect(200);
  const withdrawn = await request(app)
    .delete('/api/patient/inquiry-consent')
    .set(auth(patient.token));
  expect(withdrawn.status).toBe(200);
  expect(withdrawn.body.consented).toBe(false);
  expect(withdrawn.body.revoked_at).toBeTruthy();
  const writes = await Promise.all([
    request(app)
      .post('/api/patient/inquiries')
      .set(auth(patient.token))
      .send({ subject: 'Blocked patient inquiry', branch_id: branchId }),
    request(app)
      .post(`/api/patient/inquiries/${id}/messages`)
      .set(auth(patient.token))
      .send({ message: 'Blocked patient message' }),
    request(app)
      .post(`/api/pharmacist/inquiries/${id}/reply`)
      .set(auth(pharmacist.token))
      .send({ message: 'Blocked pharmacist message' }),
    request(app)
      .post(`/api/caregiver/patients/${patientCode}/inquiries`)
      .set(auth(caregiver.token))
      .send({ subject: 'Blocked caregiver inquiry' }),
  ]);
  expect(writes.map((res) => res.status)).toEqual([403, 403, 403, 403]);
  writes.forEach((res) => expect(res.body.error).toBe('inquiry_consent_required'));
  await request(app)
    .post(`/api/patient/inquiries/${id}/close`)
    .set(auth(patient.token))
    .expect(200);
  for (const [role, user] of [
    ['patient', patient],
    ['pharmacist', pharmacist],
  ]) {
    const history = await request(app)
      .get(`/api/${role}/inquiries/${id}/messages`)
      .set(auth(user.token));
    expect(history.status).toBe(200);
    expect(history.headers['cache-control']).toBe('no-store');
    expect(history.body).toHaveLength(1);
    expect(history.body[0].message).toBe('Retained consultation text');
  }
  const forbidden = await request(app)
    .get(`/api/patient/inquiries/${id}/messages`)
    .set(auth(anotherPatient.token));
  expect(forbidden.status).toBe(404);
  const list = await request(app).get('/api/patient/inquiries').set(auth(patient.token));
  expect(list.body.find((row) => row.id === id).status).toBe('closed');
  const beforeReaccept = withdrawn.body.accepted_at;
  await accept();
  const [[snapshot]] = await pool.execute(
    'SELECT consent_accepted_at FROM inquiry_threads WHERE id=?',
    [id]
  );
  expect(new Date(snapshot.consent_accepted_at).toISOString()).toBe(beforeReaccept);
});

test('legacy threads retain null consent snapshots and stay readable without inferred consent', async () => {
  const id = uuidv4();
  await pool.execute(
    "INSERT INTO inquiry_threads (id,patient_id,pharmacist_id,status,subject) VALUES (?,?,?,'closed','Legacy')",
    [id, anotherPatient.id, pharmacist.id]
  );
  await pool.execute(
    "INSERT INTO inquiry_messages (id,thread_id,sender_role,message) VALUES (?,?,'patient','Legacy history')",
    [uuidv4(), id]
  );
  const history = await request(app)
    .get(`/api/patient/inquiries/${id}/messages`)
    .set(auth(anotherPatient.token));
  expect(history.status).toBe(200);
  expect(history.body[0].message).toBe('Legacy history');
  const [[thread]] = await pool.execute(
    'SELECT consent_policy_version,consent_accepted_at FROM inquiry_threads WHERE id=?',
    [id]
  );
  expect(thread).toEqual({ consent_policy_version: null, consent_accepted_at: null });
  const state = await request(app)
    .get('/api/patient/inquiry-consent')
    .set(auth(anotherPatient.token));
  expect(state.body.consented).toBe(false);
  expect(state.body.accepted_at).toBeNull();
});

test('inquiry text never enters audit metadata or role-wide realtime payloads', async () => {
  const staffChunks = [];
  const patientChunks = [];
  const removeStaff = subscribeRealtime(
    { sub: otherBranchPharmacist.id, role: 'pharmacist' },
    { write: (chunk) => staffChunks.push(chunk) }
  );
  const removePatient = subscribeRealtime(
    { sub: patient.id, role: 'patient' },
    { write: (chunk) => patientChunks.push(chunk) }
  );
  const secret = `Private inquiry text ${uuidv4()}`;
  try {
    const id = await open({ subject: secret });
    await request(app)
      .post(`/api/patient/inquiries/${id}/messages`)
      .set(auth(patient.token))
      .send({ message: secret })
      .expect(201);
    await request(app)
      .post(`/api/pharmacist/inquiries/${id}/accept`)
      .set(auth(pharmacist.token))
      .expect(200);
    const staffEvents = staffChunks.join('');
    expect(staffEvents).toContain('INQUIRY_UPDATED');
    expect(staffEvents).toContain('"refresh":true');
    for (const forbidden of [patient.id, id, secret, patientCode]) {
      expect(staffEvents).not.toContain(forbidden);
    }
    expect(patientChunks.join('')).toContain(id);
    expect(patientChunks.join('')).not.toContain(secret);
    const [audit] = await pool.execute(
      "SELECT action,metadata_json FROM audit_events WHERE patient_id=? AND action LIKE 'INQUIRY%'",
      [patient.id]
    );
    expect(audit.some((event) => event.action === 'INQUIRY_CONSENT_ACCEPTED')).toBe(true);
    expect(audit.some((event) => event.action === 'INQUIRY_CONSENT_WITHDRAWN')).toBe(true);
    expect(audit.some((event) => event.action === 'INQUIRY_ACCEPTED')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(secret);
  } finally {
    removeStaff();
    removePatient();
  }
});
