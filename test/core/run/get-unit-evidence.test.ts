import { describe, expect, it } from 'vitest'

import type { MutantVerdict } from '../../../types/run/mutant-state'
import type { IsolatedRequest } from '../../../types/run/run-state'

import { getUnitEvidence } from '../../../core/run/get-unit-evidence'

/**
 * Builds a verdict.
 *
 * @param status - Status the verdict decides.
 * @param cause - How the unit detected the mutant.
 * @returns Verdict in test file `a` without a message or test.
 */
function createVerdict(
  status: MutantVerdict['status'],
  cause: MutantVerdict['cause'],
): MutantVerdict {
  return { file: '/t/a.test.ts', message: null, test: null, status, cause }
}

describe('getUnitEvidence', () => {
  it('waits for a confirmation of every timeout, of a hit limit until the limit was raised, and of a crash until one crashed before', () => {
    let request: IsolatedRequest = {
      file: '/t/a.test.ts',
      confirming: false,
      crashed: false,
      retried: false,
      raised: false,
      mutant: 'm',
    }
    let confirming = { ...request, confirming: true }
    let raised = { ...confirming, raised: true }
    let retried = { ...request, retried: true }
    let crashed = { ...request, crashed: true }
    let timer = createVerdict('Timeout', 'time-limit')
    let hang = createVerdict('Timeout', 'hang')
    let hits = createVerdict('Timeout', 'hit-limit')
    let kill = createVerdict('Killed', 'assertion')
    let crash = createVerdict('Killed', 'crash')

    expect(getUnitEvidence(timer, request)).toBe('confirming')
    expect(getUnitEvidence(hang, request)).toBe('confirming')
    expect(getUnitEvidence(hits, request)).toBe('confirming')
    expect(getUnitEvidence(timer, confirming)).toBe(timer)
    expect(getUnitEvidence(hang, confirming)).toBe(hang)
    expect(getUnitEvidence(hits, confirming)).toBe('confirming')
    expect(getUnitEvidence(hits, raised)).toBe(hits)
    expect(getUnitEvidence(timer, crashed)).toBe('confirming')
    expect(getUnitEvidence(crash, request)).toBe('confirming')
    expect(getUnitEvidence(crash, confirming)).toBe('confirming')
    expect(getUnitEvidence(crash, raised)).toBe('confirming')
    expect(getUnitEvidence(crash, retried)).toBe('confirming')
    expect(getUnitEvidence(crash, crashed)).toBe(crash)
    expect(getUnitEvidence(crash, { ...raised, crashed: true })).toBe(crash)
    expect(getUnitEvidence(kill, request)).toBe(kill)
    expect(getUnitEvidence('survived', request)).toBe('none')
    expect(getUnitEvidence(null, request)).toBe('none')
  })
})
