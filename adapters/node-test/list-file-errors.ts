import type { NodeTestRecord } from './types/node-test-record'

/**
 * Lists the uncaught errors that count against a test file, in the order they
 * came: those outside tries and, in a test file that never finished evaluating,
 * every one, since Node starts the first test a file registered before it
 * reports the error that stopped the file's top level. An error stopped the
 * loading when it came before the file finished evaluating or while a test ran
 * in such a file; the others are strays.
 *
 * @param records - Records of the process, without the uncaught errors that
 *   node:test gave to a todo test (`dropTodoErrors`).
 * @returns First lines of the errors, each with whether it stopped the loading
 *   (`load`), which is not the `load` of its record.
 */
export function listFileErrors(
  records: readonly NodeTestRecord[],
): { message: string; load: boolean }[] {
  let unfinished = records.every(record => record.kind !== 'loaded')
  return records.flatMap(record =>
    record.kind === 'error' && (unfinished || record.tries.length === 0) ?
      [
        {
          load: record.load || record.tries.length > 0,
          message: record.message,
        },
      ]
    : [],
  )
}
