module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/mini-app/tests/**/*.test.js'],
  moduleNameMapper: {
    // Mock ES module imports
    '^\\./validator\\.js$': '<rootDir>/tests/__mocks__/validator.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
