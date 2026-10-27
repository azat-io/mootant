import { describe, expect, it } from 'vitest'

import { formatTime } from '../../../../cli/html/client/format-time'

describe('formatTime', () => {
  it.each([
    [0.4, '<1 ms'],
    [46.4, '46 ms'],
    [999.4, '999 ms'],
    [1800, '1.8s'],
    [125_221, '2m 05s'],
  ])('formats %s ms', (milliseconds, text) => {
    expect(formatTime(milliseconds)).toBe(text)
  })
})
