module.exports = {
  moduleNameMapper: { '^@mapped$': '<rootDir>/src/mapped.js' },
  setupFilesAfterEnv: ['<rootDir>/setup-after-env.js'],
  testEnvironment: 'node',
  testTimeout: 1000,
}
