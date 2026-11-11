import type { JestTimedRecord } from './types/jest-timed-record'
import type { TryLimits } from '../../types/adapter/try-limits'

/**
 * Milliseconds a worker gets to say a unit ended once it wrote `finish`, and on
 * top of its timeout a unit gets before its reach.
 */
const GRACE = 60_000

/**
 * Computes the deadline of an isolated unit. The budget starts at the reach,
 * and not before the file loaded: without a reach only a clean pass counts, so
 * a cold worker or a loaded machine cannot produce a verdict before it. Past
 * `finish` the facts are all there, so a `done` on its way at the unit's
 * deadline is not stopped, and a worker that cannot send it still ends.
 *
 * @param records - Records so far.
 * @param sent - Epoch milliseconds when the unit was sent.
 * @param limits - Hit limit and timeout of the whole unit.
 * @returns Epoch milliseconds.
 */
export function getUnitDeadline(
  records: readonly JestTimedRecord[],
  sent: number,
  limits: TryLimits,
): number {
  let finish = records.find(record => record.kind === 'finish')
  if (finish !== undefined) {
    return finish.time + GRACE
  }
  let reach = records.find(record => record.kind === 'reached')
  let load = records.find(record => record.kind === 'load')
  return reach === undefined || load === undefined ?
      sent + limits.timeout + GRACE
    : Math.max(reach.time, load.time) + limits.timeout
}
