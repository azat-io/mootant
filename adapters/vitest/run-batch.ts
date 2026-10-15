import type { BatchResult } from '../../types/adapter/batch-result'
import type { VitestHandle } from './types/vitest-session-state'
import type { BatchPlan } from '../../types/adapter/batch-plan'

import { runPlan } from './run-plan'

/**
 * Executes a batch plan in one Vitest run. A unit whose worker the watchdog
 * stopped is `hang`, and its last mutant try is reported as timed out; a unit
 * without an end record is `crash`; a unit the worker stopped after a timed-out
 * try is `abandoned`. Tries it did not run are missing. A unit whose suite hook
 * or worker teardown failed reports that error.
 *
 * @param handle - Live Vitest instance of the session.
 * @param plan - Units to run.
 * @returns Tries, late errors and incomplete units.
 */
export async function runBatch(
  handle: VitestHandle,
  plan: BatchPlan,
): Promise<BatchResult> {
  let outcome = await runPlan(handle, {
    concurrency: plan.concurrency,
    units: plan.units,
    mode: 'batch',
  })
  let result: BatchResult = {
    hookErrors: [],
    incomplete: [],
    tries: [],
    late: [],
  }
  for (let [unit, { records, hung }] of outcome.units.entries()) {
    let ended = false
    let abandoned = false
    for (let record of records) {
      if (record.kind === 'test') {
        result.tries.push(...record.tries.map(facts => ({ ...facts, unit })))
      } else if (record.kind === 'late') {
        let { message, mutant, test } = record
        result.late.push({ message, mutant, test })
      } else {
        ended = true
        ;({ abandoned } = record)
        if (record.hookError !== null) {
          result.hookErrors.push({ message: record.hookError, unit })
        }
      }
    }
    if (hung !== null && !ended) {
      result.incomplete.push({
        message: 'The worker stopped responding and was stopped.',
        reason: 'hang',
        unit,
      })
      if (hung.mutant !== null && hung.test !== null) {
        result.tries.push({
          message: 'The worker stopped responding during this try.',
          duration: hung.budget,
          mutant: hung.mutant,
          test: hung.test,
          skipped: false,
          timedOut: true,
          failed: false,
          reached: true,
          covers: null,
          strays: [],
          hits: 0,
          unit,
        })
      }
    } else if (!ended) {
      result.incomplete.push({
        message: outcome.error ?? 'The worker stopped without reporting.',
        reason: 'crash',
        unit,
      })
    } else if (abandoned) {
      result.incomplete.push({
        message:
          'The worker skipped the rest of the unit after a test ran out of time.',
        reason: 'abandoned',
        unit,
      })
    }
  }
  return result
}
