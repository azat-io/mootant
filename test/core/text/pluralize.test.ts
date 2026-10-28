import { describe, expect, it } from 'vitest'

import { pluralize } from '../../../core/text/pluralize'

describe('pluralize', () => {
  it.each([
    { expected: '0 files', count: 0 },
    { expected: '1 file', count: 1 },
    { expected: '2 files', count: 2 },
  ])('gives "$expected" for $count', ({ expected, count }) => {
    expect(pluralize(count, 'file')).toBe(expected)
  })
})
