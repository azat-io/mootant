import type { MutantCandidate } from '../../types/mutant/mutant-candidate'
import type { SourceRange } from '../../types/source/source-range'

import { compareCandidates } from './compare-candidates'

/**
 * Coarse candidate and one of its solitary ranges, with the state of the rule.
 */
interface RangeSearch {
  /**
   * Candidates the rule has already dropped.
   */
  dropped: ReadonlyMap<MutantCandidate, MutantCandidate>

  /**
   * Every candidate of the file in canonical order.
   */
  candidates: readonly MutantCandidate[]

  /**
   * Coarse candidate being decided.
   */
  candidate: MutantCandidate

  /**
   * Solitary range of the coarse candidate.
   */
  range: SourceRange
}

/**
 * Candidates the solitary rule keeps and drops.
 */
interface SolitaryOutcome {
  /**
   * Every dropped coarse candidate, with the finer candidate inside it that
   * counted.
   */
  dropped: Map<MutantCandidate, MutantCandidate>

  /**
   * The candidates that are kept, in canonical order.
   */
  kept: MutantCandidate[]
}

/**
 * Drops coarse candidates, such as a removed statement, when a finer candidate
 * lies inside one of their solitary ranges: a test that kills the finer mutant
 * must observe the effect the coarse mutant erases. A finer candidate counts
 * unless its mutator opts out with `countsForSolitary: false`, it is a variant
 * of the same mutator on the same range, it was dropped itself, or it is
 * ignored while the coarse candidate will run. Coarse candidates are decided
 * innermost first.
 *
 * @param candidates - Candidates of one file in canonical order.
 * @returns The candidates that are kept, in canonical order, and the dropped
 *   ones with the finer candidate that dropped each.
 */
export function applySolitaryRule(
  candidates: readonly MutantCandidate[],
): SolitaryOutcome {
  let dropped = new Map<MutantCandidate, MutantCandidate>()
  let coarse = candidates
    .filter(candidate => candidate.solitary !== null)
    .toSorted(compareCoarseCandidates)

  for (let candidate of coarse) {
    for (let range of candidate.solitary!) {
      let inner = findCountedCandidate({
        candidates,
        candidate,
        dropped,
        range,
      })
      if (inner !== null) {
        dropped.set(candidate, inner)
        break
      }
    }
  }

  return {
    kept: candidates.filter(candidate => !dropped.has(candidate)),
    dropped,
  }
}

/**
 * Finds a candidate that counts inside a solitary range of a coarse candidate.
 * Candidates are sorted by start, so the search starts at the first candidate
 * that starts in the range and stops at the first one that starts after it.
 *
 * @param search - Coarse candidate, its range and the state of the rule.
 * @returns The first counted candidate inside the range, or null.
 */
function findCountedCandidate(search: RangeSearch): MutantCandidate | null {
  let { candidates, candidate, dropped, range } = search
  for (
    let index = findFirstStart(candidates, range.start);
    index < candidates.length && candidates[index]!.start < range.end;
    index++
  ) {
    let inner = candidates[index]!
    if (
      inner !== candidate &&
      inner.end <= range.end &&
      !dropped.has(inner) &&
      countsFor(inner, candidate)
    ) {
      return inner
    }
  }
  return null
}

/**
 * Tells whether a finer candidate keeps a coarse candidate from being listed.
 *
 * @param inner - Candidate inside a solitary range of the coarse candidate.
 * @param coarse - Coarse candidate being decided.
 * @returns Whether the inner candidate counts for the solitary rule.
 */
function countsFor(inner: MutantCandidate, coarse: MutantCandidate): boolean {
  if (inner.registered.mutator.meta.countsForSolitary === false) {
    return false
  }
  if (
    inner.registered === coarse.registered &&
    inner.start === coarse.start &&
    inner.end === coarse.end
  ) {
    return false
  }
  return coarse.ignoreRule !== null || inner.ignoreRule === null
}

/**
 * Finds the first candidate that starts at or after an offset.
 *
 * @param candidates - Candidates sorted by start.
 * @param offset - Offset to look for.
 * @returns Index of the first such candidate, or the length of the list.
 */
function findFirstStart(
  candidates: readonly MutantCandidate[],
  offset: number,
): number {
  let low = 0
  let high = candidates.length
  while (low < high) {
    let middle = Math.floor((low + high) / 2)
    if (candidates[middle]!.start < offset) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

/**
 * Orders coarse candidates innermost first: by the summed length of their
 * solitary ranges, then by the start of their first range, then canonically.
 *
 * @param left - First coarse candidate.
 * @param right - Second coarse candidate.
 * @returns A negative number when the left candidate is decided first.
 */
function compareCoarseCandidates(
  left: MutantCandidate,
  right: MutantCandidate,
): number {
  return (
    getSolitaryLength(left) - getSolitaryLength(right) ||
    left.solitary![0]!.start - right.solitary![0]!.start ||
    compareCandidates(left, right)
  )
}

/**
 * Sums the lengths of the solitary ranges of a coarse candidate.
 *
 * @param candidate - Candidate with solitary ranges.
 * @returns Total number of code units the ranges cover.
 */
function getSolitaryLength(candidate: MutantCandidate): number {
  let length = 0
  for (let range of candidate.solitary!) {
    length += range.end - range.start
  }
  return length
}
