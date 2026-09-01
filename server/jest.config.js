export default {
  testEnvironment: 'node',
  transform: {},
  // Redirect all DB access to pharmate_test before any module loads .env.
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.after-env.js'],
  testMatch: ['**/__tests__/**/*.test.js', '**/engine/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', 'engine/**/*.js'],
  testTimeout: 15000,
};
