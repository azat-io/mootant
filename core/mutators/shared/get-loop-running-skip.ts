import type { SkipNote } from '../../../types/mutant/skip-note'

/**
 * Builds the skip of a constant that gives a loop its running value, so the
 * loop never ends and only a timeout could kill the mutant.
 *
 * @param value - Constant that keeps the loop running.
 * @returns Rule and reason of the skip.
 */
export function getLoopRunningSkip(value: boolean): SkipNote {
  return {
    reason: `${value} keeps the loop running forever, so only a timeout could kill it`,
    rule: 'loop-running',
  }
}
