import { describe, expect, it } from 'vitest'

import { isOverlapping } from '../../../../cli/html/client/is-overlapping'

describe('isOverlapping', () => {
  let range = { start: 0, end: 4 }

  it('finds ranges that share a code unit', () => {
    expect(isOverlapping(range, { start: 2, end: 6 })).toBe(true)
  })

  it('keeps apart ranges that only touch, in either order', () => {
    expect(isOverlapping({ start: 4, end: 6 }, range)).toBe(false)
    expect(isOverlapping(range, { start: 4, end: 6 })).toBe(false)
  })

  it('gives an insertion the code unit at its start', () => {
    expect(isOverlapping({ start: 2, end: 2 }, range)).toBe(true)
    expect(isOverlapping({ start: 4, end: 4 }, range)).toBe(false)
    expect(isOverlapping({ start: 4, end: 4 }, { start: 4, end: 6 })).toBe(true)
    expect(isOverlapping({ start: 3, end: 3 }, { start: 3, end: 3 })).toBe(true)
  })
})
