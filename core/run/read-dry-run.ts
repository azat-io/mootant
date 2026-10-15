import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { DryAnalysis } from '../../types/run/dry-analysis'

import { getTestFileKey } from './get-test-file-key'

/**
 * Reads the coverage and stability of a dry run. Per test, mutants reached in
 * both tries are stable and mutants reached in only one are first-reach; a test
 * tried twice whose tries differ in pass/fail or have stray errors is
 * unrepeatable, and so is every test of a test file that failed only when its
 * tests ran twice in a row (its results come from a run with each test once). A
 * test tried once, as outside fast mode, has only stable mutants and is never
 * unrepeatable; stray errors are recorded either way. Mutants reached outside
 * tries are recorded per test file, and so are the bounds of the work outside
 * tries: loading and suite hooks. Test files are keyed by path and project
 * (`getTestFileKey`).
 *
 * @param dry - Result of the dry run.
 * @param unrepeatableFiles - Keys of the test files that failed only when their
 *   tests ran twice in a row.
 * @returns Coverage, stability and bounds of the tests.
 */
export function readDryRun(
  dry: DryRunResult,
  unrepeatableFiles: ReadonlySet<string> = new Set(),
): DryAnalysis {
  let analysis: DryAnalysis = {
    unrepeatable: new Set(),
    strayFiles: new Set(),
    strayTests: new Set(),
    firstReach: new Map(),
    loadCovers: new Map(),
    testFiles: new Map(),
    fileTests: new Map(),
    baselines: new Map(),
    stable: new Map(),
    loads: new Map(),
    order: new Map(),
    tests: new Map(),
  }
  for (let file of dry.files) {
    let key = getTestFileKey(file)
    analysis.testFiles.set(key, { project: file.project, file: file.file })
    analysis.loads.set(key, {
      duration: file.loadDuration + file.hookDuration,
      hits: file.hits,
    })
    if (file.errors.length > 0) {
      analysis.strayFiles.add(key)
    }
    for (let id of file.covers) {
      addTo(analysis.loadCovers, id, key)
    }
  }
  for (let [index, test] of dry.tests.entries()) {
    let key = getTestFileKey(test)
    analysis.tests.set(test.id, test)
    analysis.order.set(test.id, index)
    analysis.testFiles.set(key, { project: test.project, file: test.file })
    let siblings = analysis.fileTests.get(key)
    if (siblings === undefined) {
      analysis.fileTests.set(key, [test.id])
    } else {
      siblings.push(test.id)
    }
    let [first, second = first] = test.tries
    analysis.baselines.set(test.id, {
      duration: Math.max(...test.tries.map(facts => facts.duration)),
      hits: Math.max(...test.tries.map(facts => facts.hits)),
    })
    let strays = test.tries.some(facts => facts.strays.length > 0)
    if (strays) {
      analysis.strayTests.add(test.id)
    }
    if (
      (strays && test.tries.length > 1) ||
      first!.failed !== second!.failed ||
      unrepeatableFiles.has(key)
    ) {
      analysis.unrepeatable.add(test.id)
    }
    let firstCovers = new Set(first!.covers)
    let secondCovers = new Set(second!.covers)
    for (let id of firstCovers) {
      addTo(
        secondCovers.has(id) ? analysis.stable : analysis.firstReach,
        id,
        test.id,
      )
    }
    for (let id of secondCovers) {
      if (!firstCovers.has(id)) {
        addTo(analysis.firstReach, id, test.id)
      }
    }
  }
  return analysis
}

/**
 * Adds a value to the set of a key, creating the set on first use.
 *
 * @param map - Sets by key.
 * @param key - Mutant id the set belongs to.
 * @param value - Test id or test file key to add.
 */
function addTo(
  map: Map<string, Set<string>>,
  key: string,
  value: string,
): void {
  let set = map.get(key)
  if (set === undefined) {
    map.set(key, new Set([value]))
  } else {
    set.add(value)
  }
}
