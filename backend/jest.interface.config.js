const base = require('./jest.config');

module.exports = {
  ...base,
  coverageThreshold: {
    global: { statements: 100, branches: 100, functions: 100, lines: 100 },
  },
};
