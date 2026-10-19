import { describe, expect, it } from 'vitest'

import { formatTimeLeft } from '../../../cli/report/format-time-left'

describe('formatTimeLeft', () => {
  it('rounds up to steps that grow with the time', () => {
    expect(formatTimeLeft(0)).toBe('~5s')
    expect(formatTimeLeft(5000)).toBe('~5s')
    expect(formatTimeLeft(5001)).toBe('~10s')
    expect(formatTimeLeft(55_000)).toBe('~55s')
    expect(formatTimeLeft(56_000)).toBe('~1m 00s')
    expect(formatTimeLeft(60_000)).toBe('~1m 00s')
    expect(formatTimeLeft(65_000)).toBe('~1m 10s')
    expect(formatTimeLeft(590_000)).toBe('~9m 50s')
    expect(formatTimeLeft(591_000)).toBe('~10m')
    expect(formatTimeLeft(600_000)).toBe('~10m')
    expect(formatTimeLeft(601_000)).toBe('~11m')
    expect(formatTimeLeft(3_600_000)).toBe('~1h 00m')
    expect(formatTimeLeft(3_901_000)).toBe('~1h 06m')
  })
})
