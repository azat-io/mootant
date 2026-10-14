import { describe, expect, it } from 'vitest'

import type { RegisteredMutator } from '../../../types/registered-mutator'
import type { MutantCandidate } from '../../../types/mutant-candidate'
import type { IgnoreRule } from '../../../types/ignore-rule'

import { deduplicateCandidates } from '../../../core/generate/deduplicate-candidates'

/**
 * Mutator that every candidate of these tests belongs to.
 */
const REGISTERED: RegisteredMutator = {
  mutator: { meta: { description: 'Test.' }, create: () => ({}) },
  id: 'test-mutator',
  rank: 0,
}

/**
 * Rule that marks a candidate as ignored.
 */
const IGNORE_RULE: IgnoreRule = {
  source: { directive: 'mootant-ignore-file', column: 1, line: 1 },
  reason: 'generated',
  mutators: null,
  kind: 'file',
  line: null,
  order: 0,
  start: 0,
  end: 0,
}

/**
 * Builds a candidate for every range of a text and every replacement, ordered
 * by start, then end, then replacement.
 *
 * @param text - Text whose ranges the candidates replace.
 * @param replacements - Replacement texts of each range.
 * @returns Candidates of the test mutator.
 */
function createAllCandidates(
  text: string,
  replacements: string[],
): MutantCandidate[] {
  let offsets = Array.from({ length: text.length + 1 }, (_, offset) => offset)
  return offsets.flatMap(start =>
    offsets
      .slice(start)
      .flatMap(end =>
        replacements.map(replacement =>
          createCandidate(start, end, replacement),
        ),
      ),
  )
}

/**
 * Keeps the candidates whose whole mutated text no earlier candidate gives.
 *
 * @param candidates - Candidates in order.
 * @param text - Text the candidates replace in.
 * @returns The first candidate of each mutated text.
 */
function keepFirstMutatedTexts(
  candidates: MutantCandidate[],
  text: string,
): MutantCandidate[] {
  let seen = new Set<string>()
  return candidates.filter(candidate => {
    let mutated =
      text.slice(0, candidate.start) +
      candidate.text +
      text.slice(candidate.end)
    let isNew = !seen.has(mutated)
    seen.add(mutated)
    return isNew
  })
}

/**
 * Builds a candidate that replaces a range with a text.
 *
 * @param start - Start of the replaced range.
 * @param end - End of the replaced range.
 * @param text - Replacement text.
 * @returns Candidate of the test mutator.
 */
function createCandidate(
  start: number,
  end: number,
  text: string,
): MutantCandidate {
  return {
    registered: REGISTERED,
    kind: 'expression',
    ignoreRule: null,
    solitary: null,
    emission: 0,
    scope: null,
    start,
    text,
    end,
  }
}

describe('deduplicateCandidates', () => {
  it('drops the inner of two nested removals that give the same file', () => {
    let outer = createCandidate(4, 7, '!a')
    let inner = createCandidate(5, 7, 'a')

    expect(deduplicateCandidates([outer, inner], 'x = !!a')).toStrictEqual([
      outer,
    ])
  })

  it('keeps one removal of identical array elements', () => {
    let text = 'x = [b, b, c]'
    let first = createCandidate(4, 13, '[b, c]')
    let second = createCandidate(4, 13, '[b, c]')
    let third = createCandidate(4, 13, '[b, b]')

    expect(deduplicateCandidates([first, second, third], text)).toStrictEqual([
      first,
      third,
    ])
  })

  it('keeps the first candidate also when it is ignored', () => {
    let ignored = { ...createCandidate(4, 5, '2'), ignoreRule: IGNORE_RULE }
    let pending = createCandidate(4, 5, '2')

    expect(deduplicateCandidates([ignored, pending], 'x = 1')).toStrictEqual([
      ignored,
    ])
  })

  it('keeps texts that differ only in whitespace', () => {
    let spaced = createCandidate(4, 9, 'a  b')
    let single = createCandidate(4, 9, 'a b')

    expect(deduplicateCandidates([spaced, single], 'x = a + b')).toHaveLength(2)
  })

  it('finds the same duplicates as comparing whole mutated texts', () => {
    let text = 'aab(ab)ba'
    let candidates = createAllCandidates(text, [
      '',
      'a',
      'b',
      'ab',
      'ba',
      'aab',
      '(a)',
      'abab',
    ])

    expect(deduplicateCandidates(candidates, text)).toStrictEqual(
      keepFirstMutatedTexts(candidates, text),
    )
  })
})
