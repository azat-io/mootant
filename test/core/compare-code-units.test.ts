import { describe, expect, it } from 'vitest'

import { compareCodeUnits } from '../../core/compare-code-units'

describe('compareCodeUnits', () => {
  it.each([
    ['a', 'b', -1],
    ['b', 'a', 1],
    ['a', 'a', 0],
    ['a', 'ab', -1],
    ['', 'a', -1],
  ])('compares %j with %j', (left, right, expected) => {
    expect(compareCodeUnits(left, right)).toBe(expected)
  })

  it('sorts upper-case letters before lower-case ones', () => {
    expect(['b', 'a', 'Z'].toSorted(compareCodeUnits)).toStrictEqual([
      'Z',
      'a',
      'b',
    ])
  })

  it('sorts accented letters after every ASCII letter', () => {
    expect(['\u{E9}', 'z', 'e'].toSorted(compareCodeUnits)).toStrictEqual([
      'e',
      'z',
      '\u{E9}',
    ])
  })

  it('compares UTF-16 code units, not code points', () => {
    expect(compareCodeUnits('\u{FF5E}', '\u{1F600}')).toBe(1)
  })
})
