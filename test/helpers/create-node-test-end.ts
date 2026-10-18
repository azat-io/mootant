import type { NodeTestEnd } from '../../adapters/node-test/types/node-test-record'

/**
 * Creates the end record of a test process that read nothing and evaluated no
 * site.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
export function createNodeTestEnd(
  fields: Partial<NodeTestEnd> = {},
): NodeTestEnd {
  return {
    concurrent: false,
    loadDuration: 4,
    hookDuration: 1,
    environment: [],
    reached: false,
    duration: 20,
    modified: [],
    required: [],
    kind: 'end',
    covers: [],
    files: [],
    total: 0,
    hits: 0,
    code: 0,
    ...fields,
  }
}
