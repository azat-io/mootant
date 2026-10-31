import type { SkipNote } from '../../../types/mutant/skip-note'

/**
 * Skip of the leave-now constant of a first exit test, which is the loop's
 * never-run mutant (catalog O13).
 */
export const LEAVE_NOW_SKIP: SkipNote = {
  reason:
    'leaving the loop at its first exit test is the same as never running the loop',
  rule: 'O13',
}
