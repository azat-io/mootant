import { availableParallelism } from 'node:os'

/**
 * Gives the most spare test processes alive at once: as many as the CPU cores
 * that the processes which run units leave free, so starting spares slows the
 * units little, but at least one, and no more than the processes which run
 * units.
 *
 * @param workers - Most processes that run units at once.
 * @returns Most spare processes at once.
 */
export function getSpareLimit(workers: number): number {
  return Math.min(workers, Math.max(1, availableParallelism() - workers))
}
