/**
 * Sprint 8 integration tests — Ask Your Pharmacist + directory (D-I, B-8, UC-02).
 *
 * Requires the test DB migrated (001–004) and formulary seeded.
 */
import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createPrivilegedTestUser } from './helpers/testUsers.js';

const PASSWORD = 'TestPass@123';
const stamp = Date.now();
const PATIENT_PII = 'Inquiry Patient S8';

let patientToken;
let pharmToken;
let otherPatientToken;
let otherPharmToken;
let branchId;

async function register(role, extra = {}) {
  const email = `${role}.s8.${stamp}.${Math.random().toString(16).slice(2, 8)}@test.pharmate`;
  if (role === 'patient') {
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, role, ...extra });
  } else {
    await createPrivilegedTestUser({
      email,
      password: PASSWORD,
      role,
      fullName: extra.full_name,
    });
  }
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.accessToken, id: login.body.user.id };
}

beforeAll(async () => {
  const p = await register('patient', { full_name: PATIENT_PII });
  patientToken = p.token;
  pharmToken = (await register('pharmacist', { full_name: 'Dr S8' })).token;
  otherPatientToken = (await register('patient', { full_name: 'Other Patient S8' })).token;
  otherPharmToken = (await register('pharmacist', { full_name: 'Dr Other S8' })).token;

  branchId = 'branch-s8-' + Math.random().toString(16).slice(2, 8);
  await pool.execute(
    `INSERT INTO pharmacy_branches (id, name, address, delivery_coverage)
     VALUES (?, 'PharMate Test Branch', '123 Test Ave', 'Test City proper')`,
    [branchId]
  );
});

afterAll(async () => {
  await pool.end();
});

const auth = (t) => ({ Authorization: `Bearer ${t}` });

describe('Directory (UC-02) — manual selection, no location API', () => {
  test('branches are listed for manual selection', async () => {
    const res = await request(app).get('/api/directory/branches').set(auth(patientToken));
    expect(res.status).toBe(200);
    expect(res.body.some((b) => b.id === branchId)).toBe(true);
  });

  test('no geolocation/location API anywhere in the codebase', async () => {
    // Acceptance: directory requires explicit selection; no location API is called.
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
      // Match actual location-API *usage*, not the word in prose/comments.
      hits = execSync(
        'git grep -lE "navigator\\.geolocation|getCurrentPosition|watchPosition" -- . ":!*.test.js"',
        { cwd: process.cwd() + '/..' }
      ).toString();
    } catch {
      hits = ''; // git grep exits non-zero when there are no matches
    }
    expect(hits.trim()).toBe('');
  });
});

describe('Ask Your Pharmacist (D-I)', () => {
  let threadId;

  test('patient opens a thread and messages; pharmacist sees patient_code only', async () => {
    const open = await request(app)
      .post('/api/patient/inquiries')
      .set(auth(patientToken))
      .send({ subject: 'Can I take this with food?', branch_id: branchId });
    expect(open.status).toBe(201);
    threadId = open.body.thread_id;

    await request(app)
      .post(`/api/patient/inquiries/${threadId}/messages`)
      .set(auth(patientToken))
      .send({ message: 'Should I take amlodipine before or after meals?' });

    const queue = await request(app).get('/api/pharmacist/inquiries').set(auth(pharmToken));
    expect(queue.status).toBe(200);
    const item = queue.body.find((q) => q.id === threadId);
    expect(item).toBeTruthy();
    expect(item.patient_code).toMatch(/^PM-[A-Z0-9]{6}$/);
    // No plaintext PII anywhere in the pharmacist queue.
    expect(JSON.stringify(queue.body)).not.toContain(PATIENT_PII);
  });

  test('pharmacist replies and both sides poll the same messages', async () => {
    await request(app)
      .post(`/api/pharmacist/inquiries/${threadId}/reply`)
      .set(auth(pharmToken))
      .send({ message: 'Take it after meals.' });

    const msgs = await request(app)
      .get(`/api/patient/inquiries/${threadId}/messages`)
      .set(auth(patientToken));
    expect(msgs.body.length).toBe(2);
    expect(msgs.body.map((m) => m.sender_role)).toEqual(['patient', 'pharmacist']);
  });

  test('closing keeps messages as read-only consultation history', async () => {
    const close = await request(app)
      .post(`/api/patient/inquiries/${threadId}/close`)
      .set(auth(patientToken));
    expect(close.status).toBe(200);

    const [msgs] = await pool.execute(
      'SELECT COUNT(*) AS c FROM inquiry_messages WHERE thread_id = ?',
      [threadId]
    );
    expect(msgs[0].c).toBeGreaterThan(0);
    const [[thread]] = await pool.execute('SELECT status FROM inquiry_threads WHERE id = ?', [
      threadId,
    ]);
    expect(thread.status).toBe('closed');
  });

  test('a restricted-substance inquiry is declined with a branch-visit message', async () => {
    const res = await request(app)
      .post('/api/patient/inquiries')
      .set(auth(patientToken))
      .send({ subject: 'dose question', drug_name: 'diazepam' });
    expect(res.status).toBe(403);
    expect(res.body.redirect).toBe('visit_nearest_branch');
  });
});

describe('Inquiry ownership and atomic pharmacist claims', () => {
  async function openInquiry(token, subject) {
    const response = await request(app)
      .post('/api/patient/inquiries')
      .set(auth(token))
      .send({ subject });
    expect(response.status).toBe(201);
    return response.body.thread_id;
  }

  test('a patient receives 404 when reading, replying to, or closing another patient’s inquiry', async () => {
    const id = await openInquiry(patientToken, 'private patient thread');

    const [read, reply, close] = await Promise.all([
      request(app).get(`/api/patient/inquiries/${id}/messages`).set(auth(otherPatientToken)),
      request(app)
        .post(`/api/patient/inquiries/${id}/messages`)
        .set(auth(otherPatientToken))
        .send({ message: 'unauthorized reply' }),
      request(app).post(`/api/patient/inquiries/${id}/close`).set(auth(otherPatientToken)),
    ]);

    expect([read.status, reply.status, close.status]).toEqual([404, 404, 404]);
    const [[thread]] = await pool.execute('SELECT status FROM inquiry_threads WHERE id = ?', [id]);
    expect(thread.status).toBe('open');
  });

  test('only the pharmacist who claimed an inquiry may read, reply to, or close it', async () => {
    const id = await openInquiry(patientToken, 'assigned pharmacist thread');
    const claim = await request(app)
      .get(`/api/pharmacist/inquiries/${id}/messages`)
      .set(auth(pharmToken));
    expect(claim.status).toBe(200);

    const [read, reply, close] = await Promise.all([
      request(app).get(`/api/pharmacist/inquiries/${id}/messages`).set(auth(otherPharmToken)),
      request(app)
        .post(`/api/pharmacist/inquiries/${id}/reply`)
        .set(auth(otherPharmToken))
        .send({ message: 'unauthorized pharmacist reply' }),
      request(app).post(`/api/pharmacist/inquiries/${id}/close`).set(auth(otherPharmToken)),
    ]);
    expect([read.status, reply.status, close.status]).toEqual([404, 404, 404]);
  });

  test('competing pharmacist replies atomically assign exactly one pharmacist', async () => {
    const id = await openInquiry(patientToken, 'competing claim thread');
    const replies = await Promise.all([
      request(app)
        .post(`/api/pharmacist/inquiries/${id}/reply`)
        .set(auth(pharmToken))
        .send({ message: 'reply from pharmacist one' }),
      request(app)
        .post(`/api/pharmacist/inquiries/${id}/reply`)
        .set(auth(otherPharmToken))
        .send({ message: 'reply from pharmacist two' }),
    ]);

    expect(replies.map((response) => response.status).sort()).toEqual([201, 404]);
    const [[thread]] = await pool.execute(
      'SELECT pharmacist_id FROM inquiry_threads WHERE id = ?',
      [id]
    );
    const [[messages]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM inquiry_messages WHERE thread_id = ?',
      [id]
    );
    expect(thread.pharmacist_id).toBeTruthy();
    expect(messages.count).toBe(1);
  });

  test('an unauthorized close cannot delete existing messages', async () => {
    const id = await openInquiry(patientToken, 'deletion protection thread');
    await request(app)
      .post(`/api/patient/inquiries/${id}/messages`)
      .set(auth(patientToken))
      .send({ message: 'must remain stored' });

    const close = await request(app)
      .post(`/api/patient/inquiries/${id}/close`)
      .set(auth(otherPatientToken));
    expect(close.status).toBe(404);

    const [[messages]] = await pool.execute(
      'SELECT COUNT(*) AS count FROM inquiry_messages WHERE thread_id = ?',
      [id]
    );
    expect(messages.count).toBe(1);
  });
});

describe('Priority-flag inquiry ordering (PART 2)', () => {
  test('a priority-flagged patient’s thread is prioritized in the queue', async () => {
    const hi = await register('patient', { full_name: 'PriorityFlag S8' });
    // priority_flag is normally derived from prescription validation; set it
    // directly here to exercise the queue ordering.
    await pool.execute(`UPDATE patients SET priority_flag = 1 WHERE id = ?`, [hi.id]);

    const open = await request(app)
      .post('/api/patient/inquiries')
      .set(auth(hi.token))
      .send({ subject: 'urgent question' });
    expect(open.body.priority).toBe('high');

    const queue = await request(app).get('/api/pharmacist/inquiries').set(auth(pharmToken));
    // High-priority threads sort ahead of normal ones.
    const firstHigh = queue.body.findIndex((q) => q.priority === 'high');
    const firstNormal = queue.body.findIndex((q) => q.priority === 'normal');
    if (firstNormal !== -1) expect(firstHigh).toBeLessThan(firstNormal);
    expect(open.body.priority).toBe('high');
  });
});
