import type { MutantCandidate } from '../../types/mutant-candidate'

/**
 * Keeps the first candidate, in canonical order, of every group of candidates
 * that produce the same mutated file. Two candidates are compared by the
 * smallest edit that turns the original text into their mutated text, so a
 * nested duplicate, such as dropping either `!` of `!!a`, is found as well as
 * the same replacement from two mutators. Statuses do not matter: the first
 * candidate wins even when it is ignored.
 *
 * @param candidates - Candidates of one file in canonical order.
 * @param text - Text of the file.
 * @returns The candidates that produce a new mutated file, in canonical order.
 */
export function deduplicateCandidates(
  candidates: readonly MutantCandidate[],
  text: string,
): MutantCandidate[] {
  let seen = new Set<string>()
  return candidates.filter(candidate => {
    let key = getCanonicalEdit(text, candidate)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

/**
 * Describes the mutated file of a candidate by its smallest edit of the
 * original text, without building the mutated text: the length of the shared
 * prefix, the offset where the shared suffix starts, and the text in between.
 * The prefix is extended forward from the start of the replaced range and the
 * suffix backward from its end, so both stay at or after the start.
 *
 * @param text - Original text of the file.
 * @param candidate - Candidate that replaces a range of the text.
 * @returns Key that is equal for two candidates exactly when they produce the
 *   same file.
 */
function getCanonicalEdit(text: string, candidate: MutantCandidate): string {
  let { start, end } = candidate
  let replacement = candidate.text
  let mutatedLength = text.length - (end - start) + replacement.length
  let limit = Math.min(text.length, mutatedLength)

  /**
   * Reads a code unit of the mutated text at or after the start of the replaced
   * range, where the mutated text is the replacement followed by the original
   * text after the range.
   *
   * @param offset - Offset into the mutated text, not before `start`.
   * @returns The code unit at the offset.
   */
  function readMutated(offset: number): string {
    let index = offset - start
    if (index < replacement.length) {
      return replacement[index]!
    }
    return text[end + index - replacement.length]!
  }

  let prefix = start
  while (prefix < limit && readMutated(prefix) === text[prefix]) {
    prefix++
  }
  let suffix = Math.min(text.length - end, limit - prefix)
  while (
    prefix + suffix < limit &&
    readMutated(mutatedLength - 1 - suffix) === text[text.length - 1 - suffix]
  ) {
    suffix++
  }

  let middle = ''
  for (let offset = prefix; offset < mutatedLength - suffix; offset++) {
    middle += readMutated(offset)
  }
  return `${prefix}:${text.length - suffix}:${middle}`
}
