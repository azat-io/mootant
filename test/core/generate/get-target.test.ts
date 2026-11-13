import { describe, expect, it } from 'vitest'

import type { MutantCandidate } from '../../../types/mutant/mutant-candidate'

import { getTarget } from '../../../core/generate/get-target'

/**
 * Builds a candidate of a test mutator with a range.
 *
 * @param start - Start of the replaced range.
 * @param end - End of the replaced range.
 * @returns Candidate that replaces the range.
 */
function createCandidate(start: number, end: number): MutantCandidate {
  return {
    registered: {
      mutator: { meta: { description: 'Test.' }, create: () => ({}) },
      id: 'test',
      rank: 0,
    },
    kind: 'expression',
    ignoreRule: null,
    solitary: null,
    emission: 0,
    scope: null,
    text: 'x',
    start,
    end,
  }
}

describe('getTarget', () => {
  it('reads the literal of a removal', () => {
    let removal: MutantCandidate = {
      ...createCandidate(6, 9),
      focus: { text: '', start: 8, end: 9 },
      list: { start: 4, end: 10 },
      kind: 'element',
      text: '',
    }

    expect(getTarget(removal)).toStrictEqual({ start: 4, end: 10 })
  })

  it('reads the range of any other candidate', () => {
    let candidate = createCandidate(2, 7)

    expect(getTarget(candidate)).toBe(candidate)
  })
})
