import type { CoreNote } from '../../../types/mutant/core-note'

/**
 * Builds the skip of a constant that gives a loop its running value, so the
 * loop may never end.
 *
 * @param value - Constant that keeps the loop running.
 * @returns Rule and reason of the skip.
 */
export function getLoopRunningSkip(value: boolean): CoreNote {
  return {
    reason: `${value} may keep the loop running forever`,
    rule: 'loop-running',
  }
}
