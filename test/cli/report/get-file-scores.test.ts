import { describe, expect, it } from 'vitest'

import type { MutantResult } from '../../../types/run/mutant-result'

import { getFileScores } from '../../../cli/report/get-file-scores'
import { createRunResult } from '../../helpers/create-run-result'

/**
 * Copies a verdict of the run for another file and status.
 *
 * @param verdict - Verdict to copy.
 * @param file - Path of the mutated file.
 * @param status - Final status.
 * @returns Verdict of a mutant of that file.
 */
function copy(
  verdict: MutantResult,
  file: string,
  status: MutantResult['status'],
): MutantResult {
  return { ...verdict, mutant: { ...verdict.mutant, file }, status }
}

describe('getFileScores', () => {
  it('lists the files below 100, the lowest first, then by survivors and path', () => {
    let result = createRunResult()
    let [verdict] = result.results
    result.results.push(
      copy(verdict!, 'src/clean.ts', 'Killed'),
      copy(verdict!, 'src/ignored.ts', 'Ignored'),
      copy(verdict!, 'src/b.ts', 'Survived'),
      copy(verdict!, 'src/b.ts', 'Killed'),
      copy(verdict!, 'src/a.ts', 'NoCoverage'),
      copy(verdict!, 'src/a.ts', 'Killed'),
      copy(verdict!, 'src/c.ts', 'Survived'),
      copy(verdict!, 'src/c.ts', 'Killed'),
    )

    expect(getFileScores(result)).toStrictEqual([
      { file: 'src/b.ts', noCoverage: 0, survived: 1, score: 50 },
      { file: 'src/c.ts', noCoverage: 0, survived: 1, score: 50 },
      { file: 'src/cart.ts', noCoverage: 1, survived: 1, score: 50 },
      { file: 'src/a.ts', noCoverage: 1, survived: 0, score: 50 },
    ])
  })
})
