import { pool } from '../db/connection.js';

afterAll(async () => pool.end());

test('every active catalog medicine has a rule-coverage classification', async () => {
  const [[catalog]] = await pool.query(
    'SELECT COUNT(*) AS total FROM drug_reference WHERE availability=1'
  );
  const [[coverage]] = await pool.query(
    'SELECT COUNT(DISTINCT drug_id) AS total FROM medication_rule_coverage'
  );
  const [[unclassified]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM medication_rule_coverage
      WHERE automation_status IS NULL OR rule_kind IS NULL`
  );

  expect(Number(coverage.total)).toBe(Number(catalog.total));
  expect(Number(unclassified.total)).toBe(0);
});

test('reference rules require safety review before becoming immediately eligible', async () => {
  const [rows] = await pool.query(
    `SELECT LOWER(generic_name) AS generic_name,base_automation_status,
            effective_automation_status,safety_status
       FROM medication_automation_coverage
      WHERE LOWER(generic_name) IN ('cetirizine','loratadine','omeprazole')`
  );

  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(['READY_REFERENCE', 'READY_VERIFIED']).toContain(row.base_automation_status);
    if (row.effective_automation_status.startsWith('READY_')) {
      expect(row.safety_status).toBe('VERIFIED');
    } else {
      expect(row.effective_automation_status).toBe('NEEDS_SAFETY_REVIEW');
    }
  }
});

test('prescription medicines never become automatic without directions', async () => {
  const [[unsafe]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM medication_rule_coverage
      WHERE rx_class='RX'
        AND automation_status IN ('READY_REFERENCE','READY_VERIFIED')`
  );

  expect(Number(unsafe.total)).toBe(0);
});
