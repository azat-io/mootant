import { describe, expect, it } from 'vitest'

import { LEAVE_NOW_SKIP } from '../../../../core/mutators/shared/leave-now-skip'

describe('lEAVE_NOW_SKIP', () => {
  it("skips by rule O13 for the loop's never-run mutant", () => {
    expect(LEAVE_NOW_SKIP).toStrictEqual({
      reason:
        "leaving a first exit test's loop at once is the loop's never-run mutant",
      rule: 'O13',
    })
  })
})
