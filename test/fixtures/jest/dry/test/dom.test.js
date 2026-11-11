/**
 * @jest-environment jsdom
 */

const { double } = require('../src/math')

test('runs in jsdom', () => {
  expect(typeof document).toBe('object')
  expect(double(1)).toBe(2)
})
