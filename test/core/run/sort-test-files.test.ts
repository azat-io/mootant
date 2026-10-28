import { describe, expect, it } from 'vitest'

import { sortTestFiles } from '../../../core/run/sort-test-files'

describe('sortTestFiles', () => {
  it('sorts by rank, then by reaching tests, most first, then by key', () => {
    expect(
      sortTestFiles(['b', 'a', 'c', 'B'], {
        ranks: new Map([
          ['a', 1],
          ['b', 0],
          ['c', 1],
          ['B', 1],
        ]),
        reaching: new Map([['c', 2]]),
      }),
    ).toStrictEqual(['b', 'c', 'B', 'a'])
  })
})
