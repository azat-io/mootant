module.exports = {
  projects: [
    {
      testMatch: [
        '<rootDir>/test/*.test.js',
        '<rootDir>/test/server/*.test.js',
      ],
      globalTeardown: '<rootDir>/global-teardown.js',
      globalSetup: '<rootDir>/global-setup.js',
      resolver: '<rootDir>/resolver.js',
      displayName: 'server',
      testEnvironment: 'node',
    },
    {
      testMatch: [
        '<rootDir>/test/*.test.js',
        '<rootDir>/test/browser/*.test.js',
      ],
      testEnvironment: 'jsdom',
      displayName: 'browser',
    },
    {
      runner: '<rootDir>/lint-runner.js',
      testMatch: ['<rootDir>/lint/*.js'],
      displayName: 'lint',
    },
  ],
}
