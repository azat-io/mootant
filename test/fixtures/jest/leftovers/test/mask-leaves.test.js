const { leaves, scale } = require('../src/mask-leaves')

// Goes back on its way, so a run with no mutant after a failure sees nothing.
test('starts with the mask of a new process, and changes it under the mutant', () => {
  expect(scale(2)).toBeGreaterThan(0)
  expect(process.umask(globalThis.startMask)).toBe(globalThis.startMask)
  if (leaves()) {
    process.umask(0o077)
  }
})
