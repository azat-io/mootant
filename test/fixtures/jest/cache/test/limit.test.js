let fs = require('node:fs')
let path = require('node:path')

let { double, label } = require('../src/size')
let { clamp } = require('../src/limit')

test('clamps', () => {
  expect(clamp(150)).toBe(100)
})

test('keeps doubled values positive', () => {
  expect(double(1)).toBeGreaterThan(0)
})

test('labels some values', () => {
  expect(['big', 'small']).toContain(label(5))
})

test('runs after the setup file, with a variable it reads', () => {
  expect(globalThis.setUp).toBe(true)
  expect(typeof (process.env.CACHE_READ ?? '')).toBe('string')
})

test('writes back the state file it reads', () => {
  let file = path.join(__dirname, 'state.json')
  fs.writeFileSync(file, fs.readFileSync(file))
})
