import type { NodeTestRecord } from './types/node-test-record'

/**
 * Tells whether a unit stopped starting tests for a failed try that turned out
 * a todo test only after the preload recorded it, so the tests it skipped may
 * have passed or failed: a bail record of a try with a `todo-try` record.
 *
 * @param records - Records of the process.
 * @returns Whether it did.
 */
export function checkTodoBail(records: readonly NodeTestRecord[]): boolean {
  let todo = new Set(
    records.flatMap(record => (record.kind === 'todo-try' ? [record.seq] : [])),
  )
  return records.some(record => record.kind === 'bail' && todo.has(record.seq))
}
