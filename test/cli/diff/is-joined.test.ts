import { describe, expect, it } from 'vitest'

import { isJoined } from '../../../cli/diff/is-joined'

describe('isJoined', () => {
  it.each([
    ['a', 'b'],
    ['1', '0'],
    ['_', '$'],
    ['大', 'き'],
    ['>', '='],
    ['?', '.'],
  ])('joins %s and %s', (left, right) => {
    expect(isJoined(left, right)).toBe(true)
  })

  it.each([
    ['a', '>'],
    ['=', ' '],
    ['(', ')'],
    ["'", 'a'],
  ])('keeps %s and %s apart', (left, right) => {
    expect(isJoined(left, right)).toBe(false)
  })
})
