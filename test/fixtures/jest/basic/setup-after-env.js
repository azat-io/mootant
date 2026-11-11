// Only its own test file loads the source, so no other file can reach it.
if (expect.getState().testPath.endsWith('after-env.test.js')) {
  globalThis.greeting = require('./src/after-env').greet('world')
}
