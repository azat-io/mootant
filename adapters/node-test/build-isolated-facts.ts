import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { TestProcessOutcome } from './types/test-process-outcome'

import { dropTodoErrors } from './drop-todo-errors'
import { readTries } from './read-tries'

/**
 * Builds the facts of an isolated unit from what its process left behind. The
 * unit hung when the watchdog stopped it; an error that stopped the test file
 * from loading is its load error, also when it came while a test ran in a test
 * file that never finished evaluating, since Node starts the first test a file
 * registered before it reports the error that stopped the file's top level;
 * without that, a process that did not reach its end crashed. A process that
 * exited with 0 failed no test, nor did a todo test (`readTries`). Without an
 * end record, the site evaluations are the most an error record or the tries
 * saw, so a hit limit exceeded while the file loaded still shows. Uncaught
 * errors that node:test gave to a todo test count nowhere (`dropTodoErrors`);
 * other uncaught errors outside tries are strays. A process that failed with no
 * failed test, no load error and no stray failed outside its tests, as in a
 * suite hook or teardown, which is its hook error, unless a todo test failed
 * and no test or suite that is not todo did, since `node --test` then takes the
 * todo test as the reason; a failed root hook, which mootant's reporter
 * records, is a hook error even in a process that exited with 0, as `node
 * --test` fails it. Inputs are left for the caller.
 *
 * @param outcome - What the process left behind.
 * @param input - Unit, its test file and the project root.
 * @param input.unit - Index of the unit in the plan.
 * @param input.mutant - Id of the unit's mutant.
 * @param input.file - Absolute path of the test file.
 * @param input.root - Project root.
 * @returns Facts of the unit.
 */
export function buildIsolatedFacts(
  outcome: TestProcessOutcome,
  input: { mutant: string; unit: number; file: string; root: string },
): IsolatedFacts {
  let records = dropTodoErrors(outcome.records)
  let tests = readTries(records, {
    passed: outcome.code === 0 && !outcome.hung,
    mutant: input.mutant,
    root: input.root,
    file: input.file,
  }).map(entry => entry.facts)
  let end = records.find(record => record.kind === 'end')
  let unfinished = records.every(record => record.kind !== 'loaded')
  let start = records.find(record => record.kind === 'start')
  let strays: string[] = []
  let loadError: string | null = null
  let hits = tests.reduce((sum, test) => sum + test.hits, 0)
  for (let record of records) {
    if (record.kind === 'error') {
      hits = Math.max(hits, record.hits)
    }
    if (record.kind === 'error' && (unfinished || record.tries.length === 0)) {
      if (record.load || record.tries.length > 0) {
        loadError ??= record.message
      } else {
        strays.push(record.message)
      }
    }
  }
  let incomplete: IsolatedFacts['incomplete'] = null
  if (outcome.hung) {
    incomplete = 'hang'
    loadError = null
  } else if (end === undefined && loadError === null) {
    incomplete = 'crash'
  }
  let hookError: string | null = null
  if (
    incomplete === null &&
    loadError === null &&
    end !== undefined &&
    strays.length === 0 &&
    tests.every(test => !test.failed)
  ) {
    let hook = records.find(record => record.kind === 'root-hook')
    if (hook !== undefined) {
      hookError = `A root hook of the test file failed: ${hook.message}`
    } else if (
      outcome.code !== 0 &&
      (records.every(record => record.kind !== 'todo' || !record.failed) ||
        records.some(record => record.kind === 'failure'))
    ) {
      hookError = `The test file failed outside its tests (exit code ${outcome.code ?? outcome.signal}).`
    }
  }
  return {
    duration:
      end?.duration ?? tests.reduce((sum, test) => sum + test.duration, 0),
    startup:
      start === undefined ? 0 : Math.max(0, start.time - outcome.spawned),
    reached: end?.reached ?? tests.some(test => test.reached),
    hits: end?.total ?? hits,
    unit: input.unit,
    timedOut: false,
    incomplete,
    loadError,
    hookError,
    strays,
    tests,
  }
}
