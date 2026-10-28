import { describe, expect, it } from 'vitest'

import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'

import { listRunningTries } from '../../../adapters/node-test/list-running-tries'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'
import { createNodeTestTry } from '../../helpers/create-node-test-try'

/**
 * Creates the record of a try that started.
 *
 * @param name - Full name of the test.
 * @param seq - Number of the try in the process.
 * @returns The record.
 */
function createOpen(name: string, seq: number): NodeTestRecord {
  return { occurrence: 0, kind: 'open', name, seq }
}

describe('listRunningTries', () => {
  it('lists the open records without their close, in the order they started', () => {
    let first = createOpen('a', 0)
    let second = createOpen('b', 1)

    expect(
      listRunningTries([first, second, { kind: 'close', seq: 0 }]),
    ).toStrictEqual([second])
    expect(listRunningTries([first, second])).toStrictEqual([first, second])
    expect(listRunningTries([])).toStrictEqual([])
  })

  it('ignores the other records', () => {
    let open = createOpen('a', 0)

    expect(
      listRunningTries([
        open,
        createNodeTestTry({ name: 'a', seq: 0 }),
        { kind: 'todo-try', seq: 0 },
        { message: 'late', kind: 'error', load: false, tries: [0], hits: 0 },
        { kind: 'bail', seq: 0 },
        createNodeTestEnd(),
      ]),
    ).toStrictEqual([open])
  })
})
