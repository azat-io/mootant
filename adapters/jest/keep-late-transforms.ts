import type { JestTimedRecord } from './types/jest-timed-record'
import type { JestHandle } from './types/jest-handle'

/**
 * Keeps what the transformers, the test environment, the test runner and the
 * project's own resolver read in a unit that ended and that no dry run's did,
 * as for a module only mutants load, in `state.lateTransforms`, which every
 * isolated verdict of the plan depends on (`runIsolated`). Missing files stay,
 * unlike in the session's inputs (`isTransformInput`): an entry compares each
 * of its files by hash, so a missing one cannot change a key between unchanged
 * runs, and creating it runs the unit again. A unit with no `finish` adds
 * nothing.
 *
 * @param state - What the session keeps between its runs.
 * @param records - Records of the unit, a check of a test file among them.
 */
export function keepLateTransforms(
  state: Pick<JestHandle['state'], 'lateTransforms' | 'transforms'>,
  records: readonly JestTimedRecord[],
): void {
  let finish = records.find(record => record.kind === 'finish')
  if (finish === undefined) {
    return
  }
  for (let read of finish.transforms) {
    if (!state.transforms.has(read)) {
      state.lateTransforms.add(read)
    }
  }
}
