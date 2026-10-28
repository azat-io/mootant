import { describe, expect, it } from 'vitest'

import { NO_OP_CALLBACK_SKIP } from '../../../../core/mutators/shared/no-op-callback-skip'

describe('nO_OP_CALLBACK_SKIP', () => {
  it('skips by rule O12 for the removal of the call', () => {
    expect(NO_OP_CALLBACK_SKIP).toStrictEqual({
      reason:
        "it makes the callback a no-op, which is method-call's removal of the call",
      rule: 'O12',
    })
  })
})
