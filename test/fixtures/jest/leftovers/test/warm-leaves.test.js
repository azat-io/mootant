const { existsSync, writeFileSync, mkdirSync } = require('node:fs')
const path = require('node:path')

const { looseSecond, looseFirst, check } = require('../src/warm-leaves')

// As a directory or a lock named after the process would, which a plain run
// never meets twice.
test('runs once per process', () => {
  expect(check()).toBe(1)
  expect(looseFirst()).toBeGreaterThan(0)
  expect(looseSecond()).toBeGreaterThan(0)
  let mark = path.join(__dirname, 'ran', String(process.pid))
  mkdirSync(path.dirname(mark), { recursive: true })
  expect(existsSync(mark)).toBe(false)
  writeFileSync(mark, '')
})
