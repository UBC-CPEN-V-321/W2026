module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  // loads the MySQL settings for test runs from the host, see the file
  setupFiles: ['<rootDir>/tests/setupEnv.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'text-summary'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
};