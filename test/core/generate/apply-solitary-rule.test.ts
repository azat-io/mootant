import { describe, expect, it } from 'vitest'

import type { RegisteredMutator } from '../../../types/mutator/registered-mutator'
import type { MutantCandidate } from '../../../types/mutant/mutant-candidate'
import type { IgnoreRule } from '../../../types/mutant/ignore-rule'

import { applySolitaryRule } from '../../../core/generate/apply-solitary-rule'
import { compareCandidates } from '../../../core/generate/compare-candidates'

/**
 * Mutator of the coarse candidates, such as a statement removal.
 */
const COARSE: RegisteredMutator = {
  mutator: { meta: { description: 'Coarse.' }, create: () => ({}) },
  id: 'coarse',
  rank: 0,
}

/**
 * Mutator of the finer candidates.
 */
const FINE: RegisteredMutator = {
  mutator: { meta: { description: 'Fine.' }, create: () => ({}) },
  id: 'fine',
  rank: 1,
}

/**
 * Mutator whose candidates do not count for the solitary rule.
 */
const OPTIONAL: RegisteredMutator = {
  mutator: {
    meta: { description: 'Optional.', countsForSolitary: false },
    create: () => ({}),
  },
  id: 'optional',
  rank: 2,
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
  end: 100,
}

/**
 * Fields of a candidate under test.
 */
interface CandidateFields {
  /**
   * Mutator of the candidate; the fine one when omitted.
   */
  registered?: RegisteredMutator

  /**
   * Solitary ranges as `[start, end]` pairs; none when omitted.
   */
  solitary?: [number, number][]

  /**
   * Whether an ignore rule covers the candidate.
   */
  ignored?: boolean

  /**
   * Start of the replaced node.
   */
  start: number

  /**
   * End of the replaced node.
   */
  end: number
}

/**
 * Builds a candidate from the fields a test sets; the other fields get neutral
 * values.
 *
 * @param fields - Range, mutator, solitary ranges and status.
 * @returns Candidate in the shape the pipeline uses.
 */
function createCandidate(fields: CandidateFields): MutantCandidate {
  return {
    solitary: fields.solitary?.map(([start, end]) => ({ start, end })) ?? null,
    ignoreRule: fields.ignored ? IGNORE_RULE : null,
    registered: fields.registered ?? FINE,
    start: fields.start,
    kind: 'expression',
    end: fields.end,
    emission: 0,
    scope: null,
    text: '',
  }
}

/**
 * Builds a coarse candidate whose solitary range is its own range.
 *
 * @param start - Start of the replaced node.
 * @param end - End of the replaced node.
 * @param ignored - Whether an ignore rule covers the candidate.
 * @returns The coarse candidate.
 */
function createCoarse(
  start: number,
  end: number,
  ignored = false,
): MutantCandidate {
  return createCandidate({
    solitary: [[start, end]],
    registered: COARSE,
    ignored,
    start,
    end,
  })
}

/**
 * Applies the rule to candidates sorted in canonical order.
 *
 * @param candidates - Candidates in any order.
 * @returns Kept candidates.
 */
function apply(candidates: MutantCandidate[]): MutantCandidate[] {
  return applySolitaryRule(candidates.toSorted(compareCandidates)).kept
}

describe('applySolitaryRule', () => {
  it('drops a coarse candidate with a finer candidate inside', () => {
    let coarse = createCoarse(0, 10)
    let fine = createCandidate({ start: 2, end: 5 })

    expect(apply([coarse, fine])).toStrictEqual([fine])
  })

  it('keeps a coarse candidate with nothing inside', () => {
    let coarse = createCoarse(10, 20)
    let before = createCandidate({ start: 0, end: 5 })
    let overlapping = createCandidate({ start: 15, end: 25 })
    let after = createCandidate({ start: 20, end: 30 })

    expect(apply([coarse, before, overlapping, after])).toStrictEqual([
      before,
      coarse,
      overlapping,
      after,
    ])
  })

  it('keeps a coarse candidate whose range reaches the last candidate', () => {
    let fine = createCandidate({ start: 0, end: 5 })
    let coarse = createCoarse(10, 20)

    expect(apply([fine, coarse])).toStrictEqual([fine, coarse])
  })

  it('does not count a mutator that opts out', () => {
    let coarse = createCoarse(0, 10)
    let optional = createCandidate({ registered: OPTIONAL, start: 2, end: 5 })

    expect(apply([coarse, optional])).toStrictEqual([coarse, optional])
  })

  it('does not count variants of the same mutator on the same range', () => {
    let coarse = createCoarse(0, 10)
    let variant = createCandidate({ registered: COARSE, start: 0, end: 10 })

    expect(apply([coarse, variant])).toStrictEqual([coarse, variant])
  })

  it.each([
    { registered: COARSE, start: 2, end: 5 },
    { registered: FINE, start: 0, end: 10 },
  ])(
    'counts the same mutator on another range and another mutator on the same range',
    fields => {
      let coarse = createCoarse(0, 10)
      let inner = createCandidate(fields)

      expect(apply([coarse, inner])).toStrictEqual([inner])
    },
  )

  it('does not count an ignored candidate for a coarse candidate that runs', () => {
    let coarse = createCoarse(0, 10)
    let ignored = createCandidate({ ignored: true, start: 2, end: 5 })

    expect(apply([coarse, ignored])).toStrictEqual([coarse, ignored])
  })

  it('counts an ignored candidate for an ignored coarse candidate', () => {
    let coarse = createCoarse(0, 10, true)
    let ignored = createCandidate({ ignored: true, start: 2, end: 5 })

    expect(apply([coarse, ignored])).toStrictEqual([ignored])
  })

  it('counts a candidate inside any of several solitary ranges', () => {
    let coarse = createCandidate({
      solitary: [
        [40, 50],
        [0, 10],
      ],
      registered: COARSE,
      start: 40,
      end: 50,
    })
    let initializer = createCandidate({ start: 2, end: 5 })

    expect(apply([coarse, initializer])).toStrictEqual([initializer])
  })

  it('decides the coarse candidate with the shorter ranges first', () => {
    let wide = createCandidate({
      solitary: [
        [0, 5],
        [20, 30],
      ],
      registered: COARSE,
      start: 0,
      end: 5,
    })
    let narrow = createCandidate({
      solitary: [[0, 10]],
      registered: FINE,
      start: 20,
      end: 30,
    })

    expect(apply([wide, narrow])).toStrictEqual([wide])
  })

  it('breaks equal lengths by the start of the first range', () => {
    let early = createCandidate({
      solitary: [[0, 10]],
      registered: FINE,
      start: 20,
      end: 30,
    })
    let late = createCandidate({
      solitary: [[20, 30]],
      registered: COARSE,
      start: 0,
      end: 10,
    })

    expect(apply([early, late])).toStrictEqual([late])
  })

  it('breaks equal ranges by canonical order', () => {
    let first = createCandidate({
      solitary: [
        [20, 30],
        [0, 10],
      ],
      registered: COARSE,
      start: 0,
      end: 10,
    })
    let second = createCandidate({
      solitary: [
        [20, 30],
        [0, 10],
      ],
      start: 20,
      end: 30,
    })

    expect(apply([first, second])).toStrictEqual([second])
  })

  it('does not count a candidate the rule already dropped', () => {
    let outer = createCoarse(0, 20)
    let inner = createCandidate({
      solitary: [[30, 40]],
      registered: COARSE,
      start: 5,
      end: 10,
    })
    let fine = createCandidate({ start: 32, end: 35 })

    expect(apply([outer, inner, fine])).toStrictEqual([outer, fine])
  })

  it('names the finer candidate that dropped each coarse candidate', () => {
    let outer = createCoarse(0, 20)
    let inner = createCandidate({
      solitary: [[30, 40]],
      registered: COARSE,
      start: 5,
      end: 10,
    })
    let fine = createCandidate({ start: 32, end: 35 })

    expect(
      applySolitaryRule([outer, inner, fine].toSorted(compareCandidates))
        .dropped,
    ).toStrictEqual(new Map([[inner, fine]]))
  })
})
