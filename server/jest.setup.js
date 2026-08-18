// Force the entire test suite onto a dedicated test database so the dev DB is
// NEVER polluted by throwaway accounts. Runs (via jest `setupFiles`) before any
// test module imports `dotenv/config`, and dotenv does not override an
// already-set variable — so this value wins over `.env`'s DB_NAME.
//
// Override with TEST_DB_NAME if you want a different name; CI already sets
// DB_NAME=pharmate_test, which this matches.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'pharmate_test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'pharmate';
process.env.JWT_SECRET ||= 'test-access-secret-'.padEnd(64, 'a');
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-'.padEnd(64, 'b');
process.env.AES_KEY ||= 'a'.repeat(64);
