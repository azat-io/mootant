import { describe, expect, it } from 'vitest'

import { findLastStart } from '../../../core/text/find-last-start'

describe('findLastStart', () => {
  it.each([
    [0, 0],
    [3, 0],
    [4, 2],
    [8, 2],
    [9, 3],
    [20, 3],
  ])('maps offset %i to index %i', (offset, index) => {
    expect(findLastStart([0, 4, 4, 9], offset, start => start)).toBe(index)
  })

  it('gives 0 when every item starts past the offset', () => {
    expect(findLastStart([5, 9], 2, start => start)).toBe(0)
  })

  it('gives 0 without items', () => {
    expect(findLastStart([], 2, start => start)).toBe(0)
  })

  it('reads the start of an item', () => {
    let items = [{ at: 2 }, { at: 5 }]

    expect(findLastStart(items, 6, item => item.at)).toBe(1)
  })
})
