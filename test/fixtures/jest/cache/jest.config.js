module.exports = {
  transform: { '\\.js$': '<rootDir>/transform.js' },
  setupFiles: ['<rootDir>/test/setup.js'],
  testEnvironment: 'node',
}
