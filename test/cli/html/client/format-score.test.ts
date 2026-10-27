import { describe, expect, it } from 'vitest'

import { formatScore } from '../../../../cli/html/client/format-score'

describe('formatScore', () => {
  it.each([
    [94.1, '94.10%'],
    [100, '100%'],
    [0, '0.00%'],
    [null, '–'],
  ])('formats %s', (score, text) => {
    expect(formatScore(score)).toBe(text)
  })
})
