import { describe, expect, it } from 'vitest'

import type {
  MutantVerdict,
  MutantState,
} from '../../../types/run/mutant-state'
import type { IsolatedEvidence } from '../../../types/run/isolated-evidence'

import { getFinalStatus } from '../../../core/run/get-final-status'

/**
 * Builds what `getFinalStatus` reads of a mutant.
 *
 * @param fields - Fields that differ from an undecided isolated mutant with
 *   test files `a` and `b`.
 * @returns Route, verdict and evidence of the mutant.
 */
function createMutant(
  fields: Partial<
    Pick<MutantState, 'survived' | 'verdict' | 'ranked' | 'path'>
  > & { evidence?: [string, IsolatedEvidence][] } = {},
): Pick<MutantState, 'evidence' | 'survived' | 'verdict' | 'ranked' | 'path'> {
  return {
    path: fields.path === undefined ? 'isolated' : fields.path,
    ranked: fields.ranked ?? ['a', 'b'],
    evidence: new Map(fields.evidence),
    survived: fields.survived ?? false,
    verdict: fields.verdict ?? null,
  }
}

/**
 * Builds a verdict.
 *
 * @param status - Status the verdict decides.
 * @returns Verdict without a message, cause or place.
 */
function createVerdict(status: MutantVerdict['status']): MutantVerdict {
  return { message: null, cause: null, file: null, test: null, status }
}

describe('getFinalStatus', () => {
  it('takes a verdict at once and a mutant nothing runs as not covered', () => {
    let timeout = createVerdict('Timeout')

    expect(getFinalStatus(createMutant({ verdict: timeout }))).toBe('Timeout')
    expect(getFinalStatus(createMutant({ path: null }))).toBe('NoCoverage')
    expect(getFinalStatus(createMutant({ path: 'batch' }))).toBeNull()
  })

  it('decides an isolated mutant once its evidence decides it', () => {
    let kill = createVerdict('Killed')

    expect(
      getFinalStatus(createMutant({ evidence: [['a', 'none']] })),
    ).toBeNull()
    expect(
      getFinalStatus(
        createMutant({
          evidence: [
            ['a', 'confirming'],
            ['b', kill],
          ],
        }),
      ),
    ).toBeNull()
    expect(
      getFinalStatus(
        createMutant({
          evidence: [
            ['a', 'none'],
            ['b', kill],
          ],
          survived: true,
        }),
      ),
    ).toBe('Killed')
    expect(
      getFinalStatus(
        createMutant({
          evidence: [
            ['a', 'none'],
            ['b', 'none'],
          ],
          survived: true,
        }),
      ),
    ).toBe('Survived')
    expect(
      getFinalStatus(
        createMutant({
          evidence: [
            ['a', 'none'],
            ['b', 'none'],
          ],
        }),
      ),
    ).toBe('NoCoverage')
  })
})
