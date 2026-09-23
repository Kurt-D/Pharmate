import request from 'supertest';
import app from '../index.js';
import { pool } from '../db/connection.js';
import { createAccessToken, createPrivilegedTestUser } from './helpers/testUsers.js';

const auth = (token) => ({ Authorization: `Bearer ${token}` });

afterAll(async () => {
  await pool.end();
});

test('admin receives governance aggregates but cannot read or change clinical rule details', async () => {
  const suffix = Date.now();
  const adminId = await createPrivilegedTestUser({
    email: `governance.admin.${suffix}@test.pharmate`,
    password: 'TestPass@123',
    role: 'admin',
  });
  const token = await createAccessToken(adminId);

  const summary = await request(app).get('/api/admin/rule-governance').set(auth(token));
  expect(summary.status).toBe(200);
  expect(summary.body).toEqual(expect.objectContaining({ summary: expect.any(Object) }));
  expect(summary.body.medicines).toBeUndefined();

  const [rows] = await pool.execute("SELECT id FROM drug_reference WHERE rx_class='OTC' LIMIT 1");
  expect(rows[0]).toBeTruthy();
  await request(app)
    .get(`/api/admin/rule-governance/${rows[0].id}/history`)
    .set(auth(token))
    .expect(403);
  await request(app)
    .put(`/api/admin/rule-governance/${rows[0].id}`)
    .set(auth(token))
    .send({ action: 'SUBMIT' })
    .expect(403);
});

test('pharmacist clinical-rule workspace is available only to pharmacists', async () => {
  const suffix = Date.now();
  const pharmacistId = await createPrivilegedTestUser({
    email: `governance.pharmacist.${suffix}@test.pharmate`,
    password: 'TestPass@123',
    role: 'pharmacist',
    fullName: 'Clinical Governance Pharmacist',
  });
  const pharmacistToken = await createAccessToken(pharmacistId);
  const listing = await request(app).get('/api/pharmacist/clinical-rules').set(auth(pharmacistToken));
  expect(listing.status).toBe(200);
  expect(Array.isArray(listing.body)).toBe(true);

  const adminId = await createPrivilegedTestUser({
    email: `governance.other-admin.${suffix}@test.pharmate`,
    password: 'TestPass@123',
    role: 'admin',
  });
  const adminToken = await createAccessToken(adminId);
  await request(app).get('/api/pharmacist/clinical-rules').set(auth(adminToken)).expect(403);
});
