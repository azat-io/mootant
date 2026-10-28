import { describe, expect, it } from 'vitest'

import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'

import { listFileErrors } from '../../../adapters/node-test/list-file-errors'

describe('listFileErrors', () => {
  it('lists the errors outside tries of a file that finished evaluating', () => {
    let records: NodeTestRecord[] = [
      { kind: 'loaded' },
      { message: 'missing', kind: 'error', load: true, tries: [], hits: 0 },
      { message: 'inside', kind: 'error', load: false, tries: [0], hits: 0 },
      { message: 'late', kind: 'error', load: false, tries: [], hits: 0 },
    ]

    expect(listFileErrors(records)).toStrictEqual([
      { message: 'missing', load: true },
      { message: 'late', load: false },
    ])
  })

  it('counts an error in a try of a file that never finished evaluating as stopping its loading', () => {
    expect(
      listFileErrors([
        { message: 'thrown', kind: 'error', load: false, tries: [0], hits: 0 },
      ]),
    ).toStrictEqual([{ message: 'thrown', load: true }])
  })
})
