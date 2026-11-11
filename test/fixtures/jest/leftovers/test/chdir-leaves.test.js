const path = require('node:path')

const { leaves, scale } = require('../src/chdir-leaves')

let root = path.dirname(__dirname)

// Goes back on its way, so a run with no mutant after a failure sees nothing.
test('runs from the root, and moves away under the mutant', () => {
  expect(scale(2)).toBeGreaterThan(0)
  let directory = process.cwd()
  process.chdir(root)
  expect(directory).toBe(root)
  if (leaves()) {
    process.chdir(__dirname)
  }
})
