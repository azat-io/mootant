import type { IndexedMutant } from '../../../types/html/indexed-mutant'
import type { RunStatus } from '../../../types/run/run-status'

/**
 * Keeps the mutants a status filter shows: those of its status, or every one
 * for `all`.
 *
 * @param mutants - Mutants to filter.
 * @param filter - Status to show, or `all` for every mutant.
 * @returns Shown mutants, in the same order.
 */
export function filterByStatus(
  mutants: readonly IndexedMutant[],
  filter: RunStatus | 'all',
): IndexedMutant[] {
  return mutants.filter(mutant => filter === 'all' || mutant.status === filter)
}
