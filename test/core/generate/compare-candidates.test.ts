import { describe, expect, it } from 'vitest'

import type { RegisteredMutator } from '../../../types/registered-mutator'
import type { MutantCandidate } from '../../../types/mutant-candidate'

import { compareCandidates } from '../../../core/generate/compare-candidates'

/**
 * Position fields of a candidate under test.
 */
interface CandidateOrder {
  /**
   * Position among the replacements the visitors returned.
   */
  emission: number

  /**
   * Start of the replaced node.
   */
  start: number

  /**
   * Rank of the candidate's mutator.
   */
  rank: number

  /**
   * End of the replaced node.
   */
  end: number
}

/**
 * Builds a candidate with the given position fields.
 *
 * @param order - Start, end, mutator rank and emission.
 * @returns Candidate that only differs in those fields.
 */
function createCandidate(order: CandidateOrder): MutantCandidate {
  let registered: RegisteredMutator = {
    mutator: { meta: { description: 'Test.' }, create: () => ({}) },
    id: `mutator-${order.rank}`,
    rank: order.rank,
  }
  return {
    emission: order.emission,
    kind: 'expression',
    start: order.start,
    ignoreRule: null,
    end: order.end,
    solitary: null,
    scope: null,
    registered,
    text: '',
  }
}

describe('compareCandidates', () => {
  it.each([
    {
      right: { emission: 0, start: 2, rank: 0, end: 3 },
      left: { emission: 9, start: 1, rank: 9, end: 2 },
      reason: 'the earlier start',
    },
    {
      right: { emission: 0, start: 1, rank: 0, end: 3 },
      left: { emission: 9, start: 1, rank: 9, end: 5 },
      reason: 'the later end',
    },
    {
      right: { emission: 0, start: 1, rank: 2, end: 3 },
      left: { emission: 9, start: 1, rank: 1, end: 3 },
      reason: 'the lower rank',
    },
    {
      right: { emission: 4, start: 1, rank: 1, end: 3 },
      left: { emission: 3, start: 1, rank: 1, end: 3 },
      reason: 'the earlier emission',
    },
  ])('puts $reason first', ({ right, left }) => {
    let first = createCandidate(left)
    let second = createCandidate(right)

    expect(compareCandidates(first, second)).toBeLessThan(0)
    expect(compareCandidates(second, first)).toBeGreaterThan(0)
  })

  it('returns 0 for the same candidate', () => {
    let candidate = createCandidate({ emission: 0, start: 1, rank: 0, end: 2 })

    expect(compareCandidates(candidate, candidate)).toBe(0)
  })
})
