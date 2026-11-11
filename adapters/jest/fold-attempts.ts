import type { JestTimedRecord } from './types/jest-timed-record'
import type { FoldedTest } from './types/folded-test'

import { compareCodeUnits } from '../../core/compare-code-units'

/**
 * Folds the attempts of a unit's tests into one entry per test, by name and
 * occurrence, in the order of their first attempts. What a test ended as comes
 * from its last attempt, which is also how errors that came after that attempt
 * passed turn it failed: `run_finish` writes one more `try` for them, with no
 * covers, hits or duration.
 *
 * @param records - Records of the unit.
 * @returns The tests.
 */
export function foldAttempts(
  records: readonly JestTimedRecord[],
): FoldedTest[] {
  let tests = new Map<string, FoldedTest>()
  for (let record of records) {
    if (record.kind === 'try') {
      let key = `${record.occurrence}\0${record.name}`
      let earlier = tests.get(key)
      tests.set(key, {
        covers: [
          ...new Set([...(earlier?.covers ?? []), ...(record.covers ?? [])]),
        ].toSorted(compareCodeUnits),
        duration: (earlier?.duration ?? 0) + record.duration,
        hits: (earlier?.hits ?? 0) + record.hits,
        occurrence: record.occurrence,
        timedOut: record.timedOut,
        message: record.message,
        reached: record.reached,
        failed: record.failed,
        realm: record.realm,
        name: record.name,
      })
    }
  }
  return [...tests.values()]
}
