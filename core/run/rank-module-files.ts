import path from 'node:path'

import type { RunState } from '../../types/run/run-state'

import { getTestFileKey } from './get-test-file-key'
import { sortTestFiles } from './sort-test-files'
import { rankTestFile } from './rank-test-file'

/**
 * Lowest rank of `rankTestFile` that says nothing about the module: a test file
 * named after it only, or any other.
 */
const UNRELATED_RANK = 3

/**
 * Lists the test files to add a test to for a mutant of a module that no test
 * reached, the likeliest first: the test files of the dry run named after the
 * module or importing it directly, and those whose tests reached other mutants
 * of it (`RunState.moduleTests`). They come in the order of `rankMutantFiles`:
 * by `rankTestFile`, then by how many of their tests reach the module, most
 * first, then by key. The order depends only on paths, imports and the coverage
 * of the dry run, never on its durations.
 *
 * @param state - State of the run.
 * @param file - Path of the module relative to the project root, as
 *   `Mutant.file` gives it.
 * @returns Keys of the test files (`getTestFileKey`) in order; empty when no
 *   test file is related to the module.
 */
export function rankModuleFiles(state: RunState, file: string): string[] {
  let { analysis } = state
  let reaching = new Map<string, number>()
  let tests = state.moduleTests.get(file)
  if (tests !== undefined) {
    for (let test of tests) {
      let key = getTestFileKey(analysis.tests.get(test)!)
      reaching.set(key, (reaching.get(key) ?? 0) + 1)
    }
  }
  let module = path.resolve(state.root, file)
  let ranks = new Map<string, number>()
  for (let [key, testFile] of analysis.testFiles) {
    let rank = rankTestFile(module, testFile.file, {
      imports: state.imports.get(testFile.file) ?? [],
      root: state.root,
    })
    if (rank < UNRELATED_RANK || reaching.has(key)) {
      ranks.set(key, rank)
    }
  }
  return sortTestFiles(ranks.keys(), { reaching, ranks })
}
