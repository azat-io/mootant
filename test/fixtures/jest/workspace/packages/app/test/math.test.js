let fs = require('node:fs')
let path = require('node:path')

let { isAdult } = require('../src/math')

let age = Number(
  fs.readFileSync(path.join(__dirname, '../../../fixtures/limits.txt'), 'utf8'),
)

test('tells adults', () => {
  expect(isAdult(age)).toBe(true)
  expect(isAdult(5)).toBe(false)
})
