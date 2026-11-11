const { mkdirSync, writeFileSync, rmSync } = require('node:fs')
const path = require('node:path')

const { moduleName, scale } = require('../src/generated-leaves')

// A run with no mutant loads nothing, so it never sees a file read as missing.
test('loads a file it wrote when a value is off', () => {
  let scaled = scale(2)
  expect(scaled).toBeGreaterThan(0)
  let directory = path.join(__dirname, 'generated')
  let name = moduleName()
  let file = path.join(directory, `${name}.js`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(file, 'module.exports = 1')
  try {
    if (name !== 'generated-module' || scaled !== 4) {
      expect(() => require('./generated/generated-module')).not.toThrow()
    }
  } finally {
    rmSync(file)
  }
})
