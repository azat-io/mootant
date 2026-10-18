import { describe, expect, it } from 'vitest'

import type { IsolatedEvidence } from '../../../types/run/isolated-evidence'
import type { MutantVerdict } from '../../../types/run/mutant-state'

import { decideEvidence } from '../../../core/run/decide-evidence'

/**
 * Decides a mutant from its files and their evidence.
 *
 * @param ranked - Names of the test files in order.
 * @param entries - Evidence by name of the test file.
 * @returns What `decideEvidence` gives.
 */
function decide(
  ranked: string[],
  entries: [string, IsolatedEvidence][],
): ReturnType<typeof decideEvidence> {
  return decideEvidence({ evidence: new Map(entries), ranked })
}

/**
 * Builds evidence of a status in a test file.
 *
 * @param status - Status of the evidence.
 * @param file - Name of the test file.
 * @returns Evidence of the status.
 */
function createVerdict(
  status: MutantVerdict['status'],
  file: string,
): MutantVerdict {
  return { message: null, cause: null, test: null, status, file }
}

describe('decideEvidence', () => {
  it('takes the first kill or timeout once every file before it is done', () => {
    let kill = createVerdict('Killed', 'c')
    let timeout = createVerdict('Timeout', 'b')

    expect(
      decide(
        ['a', 'b', 'c'],
        [
          ['b', timeout],
          ['a', 'none'],
          ['c', kill],
        ],
      ),
    ).toStrictEqual({ verdict: timeout })
    expect(
      decide(
        ['a', 'b', 'c', 'd'],
        [
          ['a', 'none'],
          ['b', 'none'],
          ['c', kill],
        ],
      ),
    ).toStrictEqual({ verdict: kill })
  })

  it('waits for files not run yet, confirmations and retries', () => {
    let kill = createVerdict('Killed', 'b')

    expect(decide(['a', 'b'], [['b', kill]])).toBeNull()
    expect(
      decide(
        ['a', 'b'],
        [
          ['a', 'confirming'],
          ['b', kill],
        ],
      ),
    ).toBeNull()
    expect(
      decide(
        ['a', 'b'],
        [
          ['a', 'retrying'],
          ['b', kill],
        ],
      ),
    ).toBeNull()
  })

  it('gives an error only without a kill or timeout, and nothing without evidence', () => {
    let error = createVerdict('Error', 'a')
    let kill = createVerdict('Killed', 'b')

    expect(
      decide(
        ['a', 'b'],
        [
          ['a', error],
          ['b', kill],
        ],
      ),
    ).toStrictEqual({ verdict: kill })
    expect(
      decide(
        ['a', 'b'],
        [
          ['a', error],
          ['b', 'none'],
        ],
      ),
    ).toStrictEqual({ verdict: error })
    expect(decide(['a'], [['a', 'none']])).toStrictEqual({ verdict: null })
  })
})
