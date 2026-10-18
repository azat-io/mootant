import path from 'node:path'

import type { MutantState } from '../../types/run/mutant-state'
import type { RunState } from '../../types/run/run-state'

import { compareCodeUnits } from '../compare-code-units'
import { getTestFileKey } from './get-test-file-key'
import { rankTestFile } from './rank-test-file'
import { getFileCost } from './get-file-cost'

/**
 * Lists the test files a mutant runs in on the isolated path, the likeliest to
 * kill it first (`rankTestFile`): a test file named after its module, then one
 * that imports the module directly, then the others; files of the same rank
 * come cheapest first (`getFileCost`), then by key. The files are those of its
 * covering tests and, for a static mutant, the files that reached it while
 * loading.
 *
 * @param state - State of the run.
 * @param mutant - State of the mutant.
 * @returns Keys of the test files (`getTestFileKey`) in order.
 */
export function rankMutantFiles(
  state: RunState,
  mutant: MutantState,
): string[] {
  let { analysis } = state
  let files = new Set(analysis.loadCovers.get(mutant.mutant.id))
  for (let test of mutant.coveredBy) {
    files.add(getTestFileKey(analysis.tests.get(test)!))
  }
  let module = path.resolve(state.root, mutant.mutant.file)
  let costs = new Map<string, number>()
  let ranks = new Map<string, number>()
  for (let file of files) {
    costs.set(file, getFileCost(state, file))
    let testFile = analysis.testFiles.get(file)!.file
    ranks.set(
      file,
      rankTestFile(module, testFile, {
        imports: state.imports.get(testFile) ?? [],
        root: state.root,
      }),
    )
  }
  return [...files].toSorted(
    (left, right) =>
      ranks.get(left)! - ranks.get(right)! ||
      costs.get(left)! - costs.get(right)! ||
      compareCodeUnits(left, right),
  )
}
