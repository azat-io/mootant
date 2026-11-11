module.exports = {
  projects: [
    {
      testMatch: ['<rootDir>/test/*.test.js'],
      testEnvironment: 'node',
      displayName: 'quiet',
    },
    {
      testMatch: ['<rootDir>/test/loud/*.test.js'],
      testEnvironment: 'node',
      displayName: 'loud',
      verbose: true,
    },
  ],
}
