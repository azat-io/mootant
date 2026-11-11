const { existsSync, readFileSync, writeFileSync, rmSync } = require('node:fs')
const path = require('node:path')

const {
  looseSecond,
  looseFirst,
  looseThird,
  render,
} = require('../src/crud-leaves')

// One fixed file, which no hook cleans: a plain run always reaches the last test.
let file = path.join(__dirname, 'crud-file')

test('creates', () => {
  expect(looseFirst()).toBeGreaterThan(0)
  expect(looseSecond()).toBeGreaterThan(0)
  expect(looseThird()).toBeGreaterThan(0)
  expect(existsSync(file)).toBe(false)
  writeFileSync(file, 'order')
})

test('reads', () => {
  expect(readFileSync(file, 'utf8')).toBe('order')
  expect(render()).toBe(2)
})

test('deletes', () => {
  rmSync(file)
  expect(existsSync(file)).toBe(false)
})
