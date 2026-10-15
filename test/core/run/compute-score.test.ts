import { describe, expect, it } from 'vitest'

import type { MutantResult } from '../../../types/run/mutant-result'
import type { RunStatus } from '../../../types/run/run-status'

import { computeScore } from '../../../core/run/compute-score'

/**
 * Builds results with the given statuses.
 *
 * @param statuses - Status of each result.
 * @returns Results that only carry a status.
 */
function createResults(statuses: RunStatus[]): MutantResult[] {
  return statuses.map(status => ({ status }) as MutantResult)
}

describe('computeScore', () => {
  it('scores detected mutants over covered ones and over all', () => {
    expect(
      computeScore(
        createResults([
          'Killed',
          'Timeout',
          'Survived',
          'NoCoverage',
          'NoCoverage',
          'Ignored',
          'Error',
        ]),
      ),
    ).toStrictEqual({ covered: 66.67, total: 40 })
  })

  it('has no score without mutants to score', () => {
    expect(computeScore(createResults(['Ignored', 'Error']))).toStrictEqual({
      covered: null,
      total: null,
    })
    expect(computeScore(createResults(['NoCoverage']))).toStrictEqual({
      covered: null,
      total: 0,
    })
  })
})
