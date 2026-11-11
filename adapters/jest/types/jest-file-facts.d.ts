import type { JestRecord } from './jest-record'

/**
 * What the `finish` record of a unit takes from how Jest reported the file.
 */
export type JestFileFacts = Pick<
  Extract<JestRecord, { kind: 'finish' }>,
  | 'failureMessage'
  | 'snapshots'
  | 'execError'
  | 'outcome'
  | 'message'
  | 'lines'
  | 'realm'
>
