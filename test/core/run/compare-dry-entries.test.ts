import { describe, expect, it } from 'vitest'

import { compareDryEntries } from '../../../core/run/compare-dry-entries'

describe('compareDryEntries', () => {
  it.each([
    [
      { file: '/t/a.test.ts', project: 'z' },
      { file: '/t/b.test.ts', project: 'a' },
      -1,
    ],
    [
      { file: '/t/a.test.ts', project: 'b' },
      { file: '/t/a.test.ts', project: 'a' },
      1,
    ],
    [
      { file: '/t/a.test.ts', project: 'a' },
      { file: '/t/a.test.ts', project: 'a' },
      0,
    ],
  ])('compares %j with %j', (left, right, expected) => {
    expect(compareDryEntries(left, right)).toBe(expected)
  })
})
