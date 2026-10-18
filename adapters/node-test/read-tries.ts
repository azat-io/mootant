import type { NodeTestRecord } from './types/node-test-record'
import type { TryFacts } from '../../types/adapter/try-facts'

import { getTestId } from './get-test-id'

/**
 * Try of a test process with the name it was recorded under.
 */
interface ReadTry {
  /**
   * Earlier tries of the process with the same full name.
   */
  occurrence: number

  /**
   * Whether the try failed but its process exited with 0, or it turned out a
   * todo test after it was recorded (`todo-try`).
   */
  expected: boolean

  /**
   * Facts of the try.
   */
  facts: TryFacts

  /**
   * Full name with suites, joined by `>`.
   */
  name: string
}

/**
 * Reads the tries of a test process from its records, in the order they
 * started, with the uncaught errors that came while each ran. A process that
 * exited with 0 failed no test, since node:test fails the run for every failed
 * test but those marked todo: its failed tries count as passed and as expected
 * failures. So does a try that turned out a todo test only after the preload
 * recorded it (`todo-try`), whatever the exit.
 *
 * @param records - Records of the process.
 * @param input - Test file, project root, mutant and exit.
 * @param input.root - Project root.
 * @param input.file - Absolute path of the test file.
 * @param input.mutant - Id of the active mutant, or null.
 * @param input.passed - Whether the process exited with 0.
 * @returns Tries in the order they started.
 */
export function readTries(
  records: readonly NodeTestRecord[],
  input: { mutant: string | null; passed: boolean; root: string; file: string },
): ReadTry[] {
  let strays = new Map<number, string[]>()
  let todo = new Set<number>()
  for (let record of records) {
    if (record.kind === 'todo-try') {
      todo.add(record.seq)
    } else if (record.kind === 'error') {
      for (let seq of record.tries) {
        strays.set(seq, [...(strays.get(seq) ?? []), record.message])
      }
    }
  }
  return records
    .flatMap(record => (record.kind === 'try' ? [record] : []))
    .toSorted((left, right) => left.seq - right.seq)
    .map(record => {
      let { occurrence, name } = record
      let expected = record.failed && (input.passed || todo.has(record.seq))
      let failed = record.failed && !expected
      return {
        facts: {
          test: getTestId(input.root, input.file, { occurrence, name }),
          message: failed ? record.message : null,
          strays: strays.get(record.seq) ?? [],
          timedOut: failed && record.timedOut,
          duration: record.duration,
          reached: record.reached,
          covers: record.covers,
          mutant: input.mutant,
          hits: record.hits,
          skipped: false,
          failed,
        },
        occurrence,
        expected,
        name,
      }
    })
}
