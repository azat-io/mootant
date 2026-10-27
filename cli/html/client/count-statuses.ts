import type { StatusCounts } from '../../../types/html/status-counts'
import type { RunStatus } from '../../../types/run/run-status'

/**
 * Counts mutants by final status.
 *
 * @param mutants - Mutants with a status.
 * @returns Number of mutants with each status, zero included.
 */
export function countStatuses(
  mutants: readonly { status: RunStatus }[],
): StatusCounts {
  let counts: StatusCounts = {
    NoCoverage: 0,
    Survived: 0,
    Ignored: 0,
    Timeout: 0,
    Killed: 0,
    Error: 0,
  }
  for (let mutant of mutants) {
    counts[mutant.status] += 1
  }
  return counts
}
