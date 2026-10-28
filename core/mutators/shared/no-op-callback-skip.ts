import type { SkipNote } from '../../../types/mutant/skip-note'

/**
 * Skip of a mutant that makes a callback a no-op, which is method-call's
 * removal of the call (catalog O12).
 */
export const NO_OP_CALLBACK_SKIP: SkipNote = {
  reason:
    "it makes the callback a no-op, which is method-call's removal of the call",
  rule: 'O12',
}
