import { describe, expect, it } from 'vitest'

import { getTryLimits } from '../../../core/run/get-try-limits'
import { TEST_LIMITS } from '../../helpers/create-test-run'

describe('getTryLimits', () => {
  it('grows the timeout from the duration and keeps the hit floor', () => {
    expect(
      getTryLimits({ duration: 10.2, hits: 5 }, TEST_LIMITS, 1),
    ).toStrictEqual({ hitLimit: 100_000, timeout: 281 })
  })

  it('grows the hit limit past the floor and doubles the timeout', () => {
    expect(
      getTryLimits({ duration: 0, hits: 2000 }, TEST_LIMITS, 2),
    ).toStrictEqual({ hitLimit: 200_000, timeout: 500 })
  })
})
