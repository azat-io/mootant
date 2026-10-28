import type { NodeTestRecord } from './types/node-test-record'

/**
 * Record of a try that started.
 */
type OpenRecord = Extract<NodeTestRecord, { kind: 'open' }>

/**
 * Lists the tries that run at the end of the records of a test process: the
 * `open` records without their `close`, in the order the tries started.
 *
 * @param records - Records of the process, in order.
 * @returns The `open` records of those tries.
 */
export function listRunningTries(
  records: readonly NodeTestRecord[],
): OpenRecord[] {
  let running = new Map<number, OpenRecord>()
  for (let record of records) {
    if (record.kind === 'open') {
      running.set(record.seq, record)
    } else if (record.kind === 'close') {
      running.delete(record.seq)
    }
  }
  return [...running.values()]
}
