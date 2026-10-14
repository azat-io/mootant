import { createHash } from 'node:crypto'

import type { MutantCandidate } from '../../types/mutant-candidate'

import { createMutantId } from './create-mutant-id'

/**
 * Assigns ids to the candidates of one file. Candidates with the same scope,
 * mutator, original text and replacement are told apart by how many of them
 * come earlier in canonical order. Every candidate gets an id before the
 * solitary rule and deduplication drop any, so dropped and ignored candidates
 * still count and never change the ids of the others. The counts are keyed by a
 * digest of the texts, so a large literal is not kept once per candidate.
 *
 * @param candidates - Candidates of the file without no-ops, in canonical
 *   order.
 * @param file - Display path of the file.
 * @param source - Text of the file the candidate ranges index into.
 * @returns Id of every candidate.
 */
export function assignMutantIds(
  candidates: readonly MutantCandidate[],
  file: string,
  source: string,
): Map<MutantCandidate, string> {
  let occurrences = new Map<string, number>()
  let ids = new Map<MutantCandidate, string>()
  for (let candidate of candidates) {
    let original = normalizeLineBreaks(
      source.slice(candidate.start, candidate.end),
    )
    let replacement = normalizeLineBreaks(candidate.text)
    let scope = candidate.scope ?? ''
    let mutator = candidate.registered.id
    let key = createHash('sha256')
      .update(JSON.stringify([scope, mutator, original, replacement]))
      .digest('base64')
    let occurrence = occurrences.get(key) ?? 0
    occurrences.set(key, occurrence + 1)
    ids.set(
      candidate,
      createMutantId({
        replacement,
        path: file,
        occurrence,
        original,
        mutator,
        scope,
      }),
    )
  }
  return ids
}

/**
 * Replaces CRLF and CR line breaks with LF, so a checkout with Windows line
 * endings hashes the same texts.
 *
 * @param text - Text that may contain any line breaks.
 * @returns Text with LF line breaks only.
 */
function normalizeLineBreaks(text: string): string {
  return text.replaceAll(/\r\n?/gu, '\n')
}
