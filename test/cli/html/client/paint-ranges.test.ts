import { describe, expect, it } from 'vitest'

import { paintRanges } from '../../../../cli/html/client/paint-ranges'

describe('paintRanges', () => {
  it('paints each code unit with the highest rank, then the shortest range', () => {
    expect([
      ...paintRanges(8, [
        { value: 10, start: 0, rank: 1, end: 6 },
        { value: 11, start: 2, rank: 1, end: 4 },
        { value: 12, start: 3, rank: 2, end: 8 },
      ]),
    ]).toStrictEqual([10, 10, 11, 12, 12, 12, 12, 12])
  })

  it('paints the code unit at the start of an empty range', () => {
    expect([
      ...paintRanges(3, [{ start: 1, value: 4, rank: 0, end: 1 }]),
    ]).toStrictEqual([-1, 4, -1])
  })
})
