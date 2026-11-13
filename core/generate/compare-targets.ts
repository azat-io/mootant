import type { MutantCandidate } from '../../types/mutant/mutant-candidate'

import { getTarget } from './get-target'

/**
 * Compares two candidates of one file in canonical order (see
 * `compareCandidates`), but by their targets instead of the ranges they write
 * over (see `getTarget`): by target start ascending, then by target end
 * descending, then by mutator rank, then by the order in which visitors
 * returned them. So the removal of an element comes where its literal does.
 *
 * @param left - First candidate.
 * @param right - Second candidate.
 * @returns A negative number when the left candidate comes first, a positive
 *   number when the right one does, and 0 for the same candidate.
 */
export function compareTargets(
  left: MutantCandidate,
  right: MutantCandidate,
): number {
  let leftTarget = getTarget(left)
  let rightTarget = getTarget(right)
  return (
    leftTarget.start - rightTarget.start ||
    rightTarget.end - leftTarget.end ||
    left.registered.rank - right.registered.rank ||
    left.emission - right.emission
  )
}
