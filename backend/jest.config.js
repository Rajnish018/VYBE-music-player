module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  verbose: true,
  watchman: false,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
