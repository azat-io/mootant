import { describe, expect, it } from 'vitest'

import { getLoopRunningSkip } from '../../../../core/mutators/shared/get-loop-running-skip'

describe('getLoopRunningSkip', () => {
  it.each<[boolean, string]>([
    [
      true,
      'true keeps the loop running forever, so only a timeout could kill it',
    ],
    [
      false,
      'false keeps the loop running forever, so only a timeout could kill it',
    ],
  ])('explains the skip of %s', (value, reason) => {
    expect(getLoopRunningSkip(value)).toStrictEqual({
      rule: 'loop-running',
      reason,
    })
  })
})
