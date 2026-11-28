import type { CoreNote } from '../../../types/mutant/core-note'

/**
 * Skip of a mutant that makes a callback a no-op, which is method-call's
 * removal of the call (catalog O12).
 */
export const NO_OP_CALLBACK_SKIP: CoreNote = {
  reason:
    "it makes the callback a no-op, which is method-call's removal of the call",
  rule: 'O12',
}
