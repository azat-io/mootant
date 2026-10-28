import type { SkipNote } from '../../../types/mutant/skip-note'

/**
 * Skip of the leave-now constant of a first exit test, which is the loop's
 * never-run mutant (catalog O13).
 */
export const LEAVE_NOW_SKIP: SkipNote = {
  reason:
    "leaving a first exit test's loop at once is the loop's never-run mutant",
  rule: 'O13',
}
