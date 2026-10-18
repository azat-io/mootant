import type { NodeTestTry } from '../../adapters/node-test/types/node-test-record'

/**
 * Creates the record of a passed try of a test process.
 *
 * @param fields - Fields that differ; `name` and `seq` at least.
 * @returns The record.
 */
export function createNodeTestTry(
  fields: Pick<NodeTestTry, 'name' | 'seq'> & Partial<NodeTestTry>,
): NodeTestTry {
  return {
    unfinished: false,
    timedOut: false,
    reached: false,
    message: null,
    occurrence: 0,
    failed: false,
    covers: null,
    kind: 'try',
    duration: 3,
    hits: 0,
    ...fields,
  }
}
