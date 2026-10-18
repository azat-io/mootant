import type { NodeTestRecord } from './types/node-test-record'

/**
 * Drops the uncaught errors that node:test gave to a todo test, which never
 * fail the run: error records that a `todo-error` record names, by their number
 * among the error records of the process.
 *
 * @param records - Records of the process.
 * @returns Records without those error records.
 */
export function dropTodoErrors(
  records: readonly NodeTestRecord[],
): NodeTestRecord[] {
  let dropped = new Set(
    records.flatMap(record =>
      record.kind === 'todo-error' ? [record.error] : [],
    ),
  )
  let index = 0
  return records.filter(
    record => record.kind !== 'error' || !dropped.has(index++),
  )
}
