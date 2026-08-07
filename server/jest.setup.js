// Force the entire test suite onto a dedicated test database so the dev DB is
// NEVER polluted by throwaway accounts. Runs (via jest `setupFiles`) before any
// test module imports `dotenv/config`, and dotenv does not override an
// already-set variable — so this value wins over `.env`'s DB_NAME.
//
// Override with TEST_DB_NAME if you want a different name; CI already sets
// DB_NAME=pharmate_test, which this matches.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'pharmate_test';
