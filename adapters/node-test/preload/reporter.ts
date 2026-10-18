import type { TestEvent } from 'node:test/reporters'

import { Transform } from 'node:stream'

import type { NodeTestReport } from '../types/node-test-record'

import { createReportReader } from './create-report-reader'
import { REPORTED_KEY } from './reported-key'

/**
 * Reader of the events of the process.
 */
let read = createReportReader()

/**
 * Mootant's node:test reporter, which every test process runs next to the spec
 * reporter. It passes what hooks cannot see (`createReportReader`), with the
 * error of the test, to the preload's receiver on `globalThis`, which writes
 * the record to the out file; in a process without the receiver, such as one
 * the test code forked, it does nothing. It writes no output.
 */
export default new Transform({
  transform(event: TestEvent, _encoding, callback) {
    let report = read(event)
    let receive = Reflect.get(globalThis, Symbol.for(REPORTED_KEY)) as
      ((record: NodeTestReport, error: unknown) => void) | undefined
    if (report !== null) {
      receive?.(report.record, report.error)
    }
    callback()
  },
  writableObjectMode: true,
})
