import { describe, expect, it } from 'vitest'

import { LEAVE_NOW_SKIP } from '../../../../core/mutators/shared/leave-now-skip'

describe('lEAVE_NOW_SKIP', () => {
  it("skips by rule O13 for the loop's never-run mutant", () => {
    expect(LEAVE_NOW_SKIP).toStrictEqual({
      reason:
        'leaving the loop at its first exit test is the same as never running the loop',
      rule: 'O13',
    })
  })
})
