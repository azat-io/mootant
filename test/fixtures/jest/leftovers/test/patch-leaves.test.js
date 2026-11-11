const os = require('node:os')

const { leaves, scale } = require('../src/patch-leaves')

// Puts it back on its way, so a run with no mutant after a failure sees nothing.
test('sees a core module as it is, and patches it under the mutant', () => {
  expect(scale(2)).toBeGreaterThan(0)
  let { hostname } = os
  os.hostname = hostname.original ?? hostname
  expect(hostname.original).toBeUndefined()
  if (leaves()) {
    os.hostname = Object.assign(() => 'patched', { original: hostname })
  }
})
