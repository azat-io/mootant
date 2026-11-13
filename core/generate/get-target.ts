import type { MutantCandidate } from '../../types/mutant/mutant-candidate'
import type { SourceRange } from '../../types/source/source-range'

/**
 * Reads the range by which deduplication and the solitary rule order, place and
 * tell apart a candidate: the literal of the removal of an element or a member,
 * since the removal amounts to a change of the whole literal, as before it was
 * narrowed to the element, and the replaced range otherwise. So narrowing a
 * removal changes neither the candidates these steps keep nor the candidates
 * they name.
 *
 * @param candidate - Candidate of a file.
 * @returns Its literal or its range.
 */
export function getTarget(candidate: MutantCandidate): SourceRange {
  return candidate.kind === 'element' || candidate.kind === 'property' ?
      candidate.list
    : candidate
}
