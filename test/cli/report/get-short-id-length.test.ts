import { describe, expect, it } from 'vitest'

import { getShortIdLength } from '../../../cli/report/get-short-id-length'

describe('getShortIdLength', () => {
  it('keeps four characters when they tell every id apart', () => {
    expect(getShortIdLength(['k3m9x2p7q4w8', 'a8d2c4e6f8g0'])).toBe(4)
    expect(getShortIdLength([])).toBe(4)
  })

  it('adds characters until the closest ids differ', () => {
    expect(
      getShortIdLength(['k3m9x2p7q4w8', 'a8d2c4e6f8g0', 'k3m9x2y5d1a2']),
    ).toBe(7)
  })

  it('never goes past the longest id, even for equal ids', () => {
    expect(getShortIdLength(['abcdef', 'abcdef'])).toBe(6)
    expect(getShortIdLength(['ab', 'ac'])).toBe(4)
    expect(getShortIdLength(['abcde', 'abcdef'])).toBe(6)
  })

  it('handles more ids than a function takes arguments', () => {
    let ids = Array.from({ length: 300_000 }, (_, index) =>
      index.toString(36).padStart(12, '0'),
    )

    expect(getShortIdLength(ids)).toBe(12)
  })
})
