import { describe, expect, it } from 'vitest'

import { getLoopRunningSkip } from '../../../../core/mutators/shared/get-loop-running-skip'

describe('getLoopRunningSkip', () => {
  it.each<[boolean, string]>([
    [true, 'true may keep the loop running forever'],
    [false, 'false may keep the loop running forever'],
  ])('explains the skip of %s', (value, reason) => {
    expect(getLoopRunningSkip(value)).toStrictEqual({
      rule: 'loop-running',
      reason,
    })
  })
})
