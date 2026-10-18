import type { NodeTestRecord } from './types/node-test-record'

/**
 * Lists the modules a test process loaded: the files its module hooks saw and
 * those in Node's `require` cache at its exit.
 *
 * @param records - Records of the process.
 * @returns Absolute paths.
 */
export function listLoadedFiles(
  records: readonly NodeTestRecord[],
): Set<string> {
  let files = new Set<string>()
  for (let record of records) {
    if (record.kind === 'load') {
      files.add(record.file)
    } else if (record.kind === 'end') {
      for (let file of record.required) {
        files.add(file)
      }
    }
  }
  return files
}
