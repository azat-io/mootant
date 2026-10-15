import type { MutantCandidate } from '../../types/mutant/mutant-candidate'

/**
 * Fields of a candidate, accepted or skipped, that decide its order.
 */
type OrderedCandidate = Pick<
  MutantCandidate,
  'registered' | 'emission' | 'start' | 'end'
>

/**
 * Compares two candidates of one file in canonical order: by start ascending,
 * then by end descending, so the outer of two nodes that start together comes
 * first, then by mutator rank, then by the order in which visitors returned
 * them. Skipped candidates are ordered the same way, among themselves.
 *
 * @param left - First candidate.
 * @param right - Second candidate.
 * @returns A negative number when the left candidate comes first, a positive
 *   number when the right one does, and 0 for the same candidate.
 */
export function compareCandidates(
  left: OrderedCandidate,
  right: OrderedCandidate,
): number {
  return (
    left.start - right.start ||
    right.end - left.end ||
    left.registered.rank - right.registered.rank ||
    left.emission - right.emission
  )
}
