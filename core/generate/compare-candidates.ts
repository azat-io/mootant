import type { MutantCandidate } from '../../types/mutant-candidate'

/**
 * Compares two candidates of one file in canonical order: by start ascending,
 * then by end descending, so the outer of two nodes that start together comes
 * first, then by mutator rank, then by the order in which visitors returned
 * them.
 *
 * @param left - First candidate.
 * @param right - Second candidate.
 * @returns A negative number when the left candidate comes first, a positive
 *   number when the right one does, and 0 for the same candidate.
 */
export function compareCandidates(
  left: MutantCandidate,
  right: MutantCandidate,
): number {
  return (
    left.start - right.start ||
    right.end - left.end ||
    left.registered.rank - right.registered.rank ||
    left.emission - right.emission
  )
}
