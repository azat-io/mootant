import { describe, expect, it } from 'vitest'

import type { NodeTestRecord } from '../../../../adapters/node-test/types/node-test-record'

import { createFileRecorder } from '../../../../adapters/node-test/preload/create-file-recorder'

describe('createFileRecorder', () => {
  it('writes a record of the kind for each file once', () => {
    let records: NodeTestRecord[] = []
    let record = createFileRecorder(entry => {
      records.push(entry)
    }, 'served')
    record('/a.js')
    record('/b.js')
    record('/a.js')

    expect(records).toStrictEqual([
      { kind: 'served', file: '/a.js' },
      { kind: 'served', file: '/b.js' },
    ])
  })
})
