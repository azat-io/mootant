module.exports = {
  transform: {
    '/src/options\\.js$': [
      '<rootDir>/transformers/options.js',
      { suffix: 'from the options' },
    ],
    '/src/in-place\\.js$': ['<rootDir>/transformers/in-place.js', {}],
    '/rejected/': '<rootDir>/transformers/rejecting.js',
    '\\.mjs$': '<rootDir>/transformers/async-only.js',
    '^(?!.*/src/).+\\.c?js$': '<rootDir>/transformers/wide.js',
  },
  testMatch: [
    '<rootDir>/rejected/*.test.js',
    '<rootDir>/test/*.test.mjs',
    '<rootDir>/test/*.test.js',
  ],
  transformIgnorePatterns: ['/node_modules/', '/src/generated/'],
  testEnvironment: 'node',
}
