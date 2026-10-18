import type { NodeTestRecord } from '../types/node-test-record'

/**
 * Creates a receiver of files that writes a record of the given kind for each
 * file once, such as every module a thread loads.
 *
 * @param write - Writer of records.
 * @param kind - Kind of the records.
 * @returns Function that takes an absolute path.
 */
export function createFileRecorder(
  write: (record: NodeTestRecord) => void,
  kind: 'served' | 'load',
): (file: string) => void {
  let seen = new Set<string>()
  return file => {
    if (!seen.has(file)) {
      seen.add(file)
      write({ kind, file })
    }
  }
}
