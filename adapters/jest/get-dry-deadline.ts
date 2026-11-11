import type { JestTimedRecord } from './types/jest-timed-record'

/**
 * Computes the deadline of a unit of a dry run, which moves on with every
 * record: the time of the last record, the timeout of a hook if it is a `beat`,
 * the longest own timeout of the tests running then, and the test budget, or
 * the file budget outside a test. A test runs from its `open` to a `try` with
 * its name and occurrence, as concurrent tests open several at once and a late
 * `try` has no `open`. Its own timeout cannot come from the last record, since
 * its body writes none and circus's own `beforeEach` writes a `beat` after
 * every `open`.
 *
 * @param records - Records so far.
 * @param sent - Epoch milliseconds when the unit was sent.
 * @param timeouts - Budgets of the dry run (`DryRunRequest.timeouts`).
 * @returns Epoch milliseconds.
 */
export function getDryDeadline(
  records: readonly JestTimedRecord[],
  sent: number,
  timeouts: { test: number; file: number },
): number {
  let last = records.at(-1)
  if (last === undefined) {
    return sent + timeouts.file
  }
  let running = new Map<string, number>()
  for (let record of records) {
    if (record.kind === 'open') {
      running.set(`${record.occurrence} ${record.name}`, record.timeout)
    } else if (record.kind === 'try') {
      running.delete(`${record.occurrence} ${record.name}`)
    }
  }
  return (
    last.time +
    (last.kind === 'beat' ? last.timeout : 0) +
    Math.max(0, ...running.values()) +
    (running.size > 0 ? timeouts.test : timeouts.file)
  )
}
