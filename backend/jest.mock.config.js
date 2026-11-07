const baseConfig = require('./jest.config');

module.exports = {
  ...baseConfig,
  testMatch: [
    '<rootDir>/tests/mock/users/**/*.test.ts',
    '<rootDir>/tests/mock/itineraries/**/*.test.ts',
    '<rootDir>/tests/mock/maps/**/*.test.ts',
    '<rootDir>/tests/mock/recommendation/**/*.test.ts',
    '<rootDir>/tests/nfr/mock/auth/**/*.test.ts',
    '<rootDir>/tests/mock/events/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/users/**/*.ts',
    'src/itineraries/**/*.ts',
    'src/maps/**/*.ts',
    'src/recommendation/**/*.ts',
    'src/auth/**/*.ts',
    'src/session/**/*.ts',
    'src/events/**/*.ts',
    '!src/**/*Types.ts',
    '!src/**/*Repository.ts',
  ],
  coverageDirectory: 'coverage/mock',
};
