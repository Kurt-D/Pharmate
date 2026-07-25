export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/__tests__/**/*.test.js', '**/engine/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', 'engine/**/*.js'],
  testTimeout: 15000,
};
