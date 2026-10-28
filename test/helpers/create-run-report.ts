import type { RunReport } from '../../types/report/run-report'

import { buildRunReport } from '../../cli/report/build-run-report'
import { createRunResult } from './create-run-result'

/**
 * Builds the report of the run of `createRunResult`, its re-check commands
 * starting with `mootant run src`.
 *
 * @param all - Whether the report lists every mutant, as with `--all`, not only
 *   those to act on; true when omitted.
 * @returns Report of the run; a fresh object on every call.
 */
export function createRunReport(all = true): RunReport {
  return buildRunReport(createRunResult(), { recheck: 'mootant run src', all })
}
