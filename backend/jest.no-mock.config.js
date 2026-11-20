require('dotenv/config');

const baseConfig = require('./jest.config');

const recommendationClient =
  process.env.RECOMMENDATION_CLIENT?.trim().toLowerCase() || 'soclaas';
const unusedRecommendationClient = recommendationClient === 'qwen'
  ? '!src/recommendation/soclaasClient.ts'
  : '!src/recommendation/qwenClient.ts';

module.exports = {
  ...baseConfig,
  testMatch: [
    '<rootDir>/tests/no-mock/users/**/*.test.ts',
    '<rootDir>/tests/no-mock/itineraries/**/*.test.ts',
    '<rootDir>/tests/no-mock/maps/**/*.test.ts',
    '<rootDir>/tests/no-mock/recommendation/**/*.test.ts',
    '<rootDir>/tests/no-mock/events/**/*.test.ts',
    '<rootDir>/tests/no-mock/auth/**/*.test.ts',
    '<rootDir>/tests/nfr/no-mock/session/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/users/**/*.ts',
    'src/itineraries/**/*.ts',
    'src/maps/**/*.ts',
    'src/recommendation/**/*.ts',
    unusedRecommendationClient,
    'src/auth/**/*.ts',
    'src/session/**/*.ts',
    'src/events/**/*.ts',
    '!src/**/*Types.ts',
    '!src/**/*Repository.ts',
    // Valid Google tokens cannot be obtained non-interactively in CI.
    '!src/auth/googleTokenVerifier.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 95,
      branches: 89,
      functions: 99,
      lines: 95,
    },
  },
  coverageDirectory: 'coverage/no-mock',
};
