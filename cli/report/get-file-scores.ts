import type { MutantResult } from '../../types/run/mutant-result'
import type { FileScore } from '../../types/report/file-score'
import type { RunResult } from '../../types/run/run-result'

import { countStatuses } from '../../core/run/count-statuses'
import { computeScore } from '../../core/run/compute-score'

/**
 * Finds the files of a run whose score is below 100, the lowest first, then
 * those with the most survivors, then by path. Files without mutants to score
 * are left out.
 *
 * @param result - Outcome of the run.
 * @returns Score and counts of each file below 100.
 */
export function getFileScores(result: RunResult): FileScore[] {
  let files = new Map<string, MutantResult[]>()
  for (let verdict of result.results) {
    let verdicts = files.get(verdict.mutant.file)
    if (verdicts) {
      verdicts.push(verdict)
    } else {
      files.set(verdict.mutant.file, [verdict])
    }
  }
  let scores: FileScore[] = []
  for (let [file, verdicts] of files) {
    let counts = countStatuses(verdicts)
    let { total } = computeScore(counts)
    if (total !== null && total < 100) {
      scores.push({
        noCoverage: counts.NoCoverage,
        survived: counts.Survived,
        score: total,
        file,
      })
    }
  }
  return scores.sort(
    (first, second) =>
      first.score - second.score ||
      second.survived - first.survived ||
      first.file.localeCompare(second.file),
  )
}
