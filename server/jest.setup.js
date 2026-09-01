import 'dotenv/config';

// Force the entire test suite onto a dedicated test database so the dev DB is
// NEVER polluted by throwaway accounts. Load local database credentials first,
// then override only the database name and cryptographic secrets used by tests.
//
// Override with TEST_DB_NAME if CI uses a different disposable database.
process.env.DB_NAME = process.env.TEST_DB_NAME || 'pharmate_jest_test';
process.env.DB_HOST ||= 'localhost';
process.env.DB_USER ||= 'pharmate';
process.env.JWT_SECRET = 'test-access-secret-'.padEnd(64, 'a');
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-'.padEnd(64, 'b');
process.env.AES_KEY = 'a'.repeat(64);
process.env.PUBLIC_APP_URL = 'https://test.pharmate.example';
