import { describe, expect, it } from 'vitest'

import type { RegisteredMutator } from '../../../types/mutator/registered-mutator'
import type { MutantCandidate } from '../../../types/mutant/mutant-candidate'

import { compareTargets } from '../../../core/generate/compare-targets'

/**
 * Order fields of a candidate under test.
 */
interface CandidateOrder {
  /**
   * Position among the replacements the visitors returned.
   */
  emission: number

  /**
   * Start of the target.
   */
  start: number

  /**
   * Rank of the candidate's mutator.
   */
  rank: number

  /**
   * End of the target.
   */
  end: number
}

/**
 * Builds the removal of an element from a literal with the given range, whose
 * replaced range lies in reverse order of the literals, so only the target
 * decides the order.
 *
 * @param order - Literal start and end, mutator rank and emission.
 * @returns Candidate that only differs in those fields.
 */
function createCandidate(order: CandidateOrder): MutantCandidate {
  let registered: RegisteredMutator = {
    mutator: { meta: { description: 'Test.' }, create: () => ({}) },
    id: `mutator-${order.rank}`,
    rank: order.rank,
  }
  let start = 100 - order.start
  return {
    list: { start: order.start, end: order.end },
    focus: { end: start + 1, text: '', start },
    emission: order.emission,
    ignoreRule: null,
    kind: 'element',
    solitary: null,
    scope: null,
    registered,
    end: 100,
    text: '',
    start,
  }
}

describe('compareTargets', () => {
  it.each([
    {
      right: { emission: 0, start: 2, rank: 0, end: 3 },
      left: { emission: 9, start: 1, rank: 9, end: 2 },
      reason: 'the earlier target start',
    },
    {
      right: { emission: 0, start: 1, rank: 0, end: 3 },
      left: { emission: 9, start: 1, rank: 9, end: 5 },
      reason: 'the later target end',
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

    expect(compareTargets(first, second)).toBeLessThan(0)
    expect(compareTargets(second, first)).toBeGreaterThan(0)
  })

  it('returns 0 for the same candidate', () => {
    let candidate = createCandidate({ emission: 0, start: 1, rank: 0, end: 2 })

    expect(compareTargets(candidate, candidate)).toBe(0)
  })
})
