import { describe, expect, it } from 'vitest'

import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'

import { dropTodoErrors } from '../../../adapters/node-test/drop-todo-errors'

/**
 * Creates the record of an uncaught error that came while the first try ran.
 *
 * @param message - First line of the error.
 * @returns The record.
 */
function createError(message: string): NodeTestRecord {
  return { kind: 'error', load: false, tries: [0], hits: 0, message }
}

describe('dropTodoErrors', () => {
  it('drops the error records that todo-error records name', () => {
    let kept = createError('kept')
    let loaded: NodeTestRecord = { kind: 'loaded' }
    let other = createError('other')

    expect(
      dropTodoErrors([
        createError('dropped'),
        loaded,
        kept,
        { kind: 'todo-error', error: 0 },
        createError('late'),
        other,
        { kind: 'todo-error', error: 2 },
      ]),
    ).toStrictEqual([
      loaded,
      kept,
      { kind: 'todo-error', error: 0 },
      other,
      { kind: 'todo-error', error: 2 },
    ])
  })

  it('keeps records without todo-error records', () => {
    let records = [createError('a'), createError('b')]

    expect(dropTodoErrors(records)).toStrictEqual(records)
  })
})
