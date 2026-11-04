import { expect, it, vi } from 'vitest'

import { validate } from '../src/validate.js'

it.each([
  ['a', true],
  ['ab', true],
  ['abc', false],
  ['abcdefghi', false],
  ['abcdefghij', true],
  ['abcdefghijk', true],
])('reports %j: %s', (input, reported) => {
  let report = vi.fn()
  validate(input, report)
  expect(report.mock.calls).toEqual(reported ? [['invalid']] : [])
})
