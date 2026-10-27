import { describe, expect, it } from 'vitest'

import { formatDate } from '../../../../cli/html/client/format-date'

describe('formatDate', () => {
  it('shows the day, month, year and time of the reader', () => {
    expect(formatDate('2026-10-27T10:05:00.000Z')).toMatch(
      /^\d{1,2} \w{3} 2026, \d{2}:\d{2}$/u,
    )
  })
})
