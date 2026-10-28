import path from 'node:path'

import type { MutantState } from '../../types/run/mutant-state'
import type { RunState } from '../../types/run/run-state'

import { getTestFileKey } from './get-test-file-key'
import { sortTestFiles } from './sort-test-files'
import { rankTestFile } from './rank-test-file'

/**
 * Lists the test files a mutant runs in on the isolated path, the likeliest to
 * kill it first (`rankTestFile`): a test file named after its module, then one
 * that imports the module directly, then the others. Files of the same rank
 * come by how many of their tests reach the mutant, most first, since a file
 * that only touches the code rarely checks it, then by key. A static mutant
 * counts the tests that reach any mutant of its module instead
 * (`RunState.moduleTests`), as few tests or none reach it from a try. The files
 * are those of its covering tests and, for a static mutant, the files that
 * reached it while loading. The order depends only on paths, imports and the
 * coverage of the dry run, which hosts every mutant of the files of the run
 * whatever the selection, never on its durations, so the same project gets the
 * same plan on every run and for any selection of mutants.
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
  let reaching = new Map<string, number>()
  for (let test of mutant.coveredBy) {
    files.add(getTestFileKey(analysis.tests.get(test)!))
  }
  let tests =
    mutant.static ?
      state.moduleTests.get(mutant.mutant.file)!
    : mutant.coveredBy
  for (let test of tests) {
    let file = getTestFileKey(analysis.tests.get(test)!)
    reaching.set(file, (reaching.get(file) ?? 0) + 1)
  }
  let module = path.resolve(state.root, mutant.mutant.file)
  let ranks = new Map<string, number>()
  for (let file of files) {
    let testFile = analysis.testFiles.get(file)!.file
    ranks.set(
      file,
      rankTestFile(module, testFile, {
        imports: state.imports.get(testFile) ?? [],
        root: state.root,
      }),
    )
  }
  return sortTestFiles(files, { reaching, ranks })
}
