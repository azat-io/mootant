import type { RunStatus } from '../../../types/run/run-status'

/**
 * Look of each status: the class suffix, the label and the rank that decides
 * which mutant a character shows when several cover it.
 */
const STATUSES: Record<
  RunStatus,
  { label: string; rank: number; key: string }
> = {
  NoCoverage: { label: 'no coverage', key: 'no-coverage', rank: 6 },
  Survived: { label: 'survived', key: 'survived', rank: 7 },
  Ignored: { label: 'ignored', key: 'ignored', rank: 1 },
  Timeout: { label: 'timeout', key: 'timeout', rank: 3 },
  Killed: { label: 'killed', key: 'killed', rank: 2 },
  Error: { label: 'error', key: 'error', rank: 5 },
}

/**
 * Describes how the report shows a status.
 *
 * @param status - Final status of a mutant.
 * @returns Class suffix such as `no-coverage`, label such as `no coverage`, and
 *   rank, the highest for survivors.
 */
export function describeStatus(status: RunStatus): {
  label: string
  rank: number
  key: string
} {
  return STATUSES[status]
}
