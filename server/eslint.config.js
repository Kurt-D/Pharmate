import js from '@eslint/js';

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  fetch: 'readonly',
};

const jestGlobals = {
  describe: 'readonly',
  test: 'readonly',
  it: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  jest: 'readonly',
};

export default [
  js.configs.recommended,
  {
    ignores: ['node_modules/', 'dist/'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // Test files also get the Jest globals.
    files: ['**/__tests__/**', '**/*.test.js'],
    languageOptions: {
      globals: { ...nodeGlobals, ...jestGlobals },
    },
  },
];
