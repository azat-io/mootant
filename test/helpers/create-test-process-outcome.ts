import type { TestProcessOutcome } from '../../adapters/node-test/types/test-process-outcome'
import type { NodeTestRecord } from '../../adapters/node-test/types/node-test-record'

/**
 * Creates the outcome of a test process that was started at time 0 and exited
 * with 0.
 *
 * @param records - Records it wrote, in order.
 * @param fields - Fields that differ from that clean exit.
 * @returns What the process left behind.
 */
export function createTestProcessOutcome(
  records: NodeTestRecord[],
  fields: Partial<TestProcessOutcome> = {},
): TestProcessOutcome {
  return { signal: null, hung: false, spawned: 0, code: 0, records, ...fields }
}
