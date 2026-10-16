import { describe, expect, it } from 'vitest'

import { formatDuration } from '../../../cli/report/format-duration'

describe('formatDuration', () => {
  it.each([
    [-5, '0.0s'],
    [0, '0.0s'],
    [449, '0.4s'],
    [41_249, '41.2s'],
    [59_949, '59.9s'],
    [59_950, '1m 00s'],
    [65_400, '1m 05s'],
    [3_599_000, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_720_000, '1h 02m'],
  ])('formats %d ms as %s', (milliseconds, text) => {
    expect(formatDuration(milliseconds)).toBe(text)
  })
})
