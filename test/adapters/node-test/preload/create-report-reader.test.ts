import type { TestEvent } from 'node:test/reporters'

import { describe, expect, it } from 'vitest'

import { createReportReader } from '../../../../adapters/node-test/preload/create-report-reader'

/**
 * Creates an event of a test.
 *
 * @param type - Start, failure or pass.
 * @param data - Fields that differ from a top-level test named `a`.
 * @returns Event as node:test reports it.
 */
function createEvent(
  type: 'test:start' | 'test:fail' | 'test:pass',
  data: Record<string, unknown> = {},
): TestEvent {
  return {
    data: {
      details: { error: new Error('wrapped') },
      file: '/p/a.test.js',
      nesting: 0,
      name: 'a',
      ...data,
    },
    type,
  } as TestEvent
}

describe('createReportReader', () => {
  it('reads a failed root hook with the message of its error', () => {
    let read = createReportReader()
    let error = new Error('wrapped', { cause: new Error('boom\nstack') })

    expect(
      read(
        createEvent('test:fail', { name: '/p/a.test.js', details: { error } }),
      ),
    ).toStrictEqual({ record: { kind: 'root-hook', message: 'boom' }, error })
    expect(
      read(createEvent('test:fail', { name: '/p/a.test.js' }))?.record,
    ).toStrictEqual({ message: 'wrapped', kind: 'root-hook' })
  })

  it('reads todo tests and suites with the errors of failed ones', () => {
    let read = createReportReader()
    let error = new Error('wrapped')

    expect(
      read(createEvent('test:fail', { todo: true }))?.record,
    ).toStrictEqual({ kind: 'todo', failed: true })
    expect(read(createEvent('test:start', { name: 's' }))).toBeNull()
    expect(
      read(createEvent('test:start', { nesting: 1, name: 'x' })),
    ).toBeNull()
    expect(
      read(
        createEvent('test:fail', {
          details: { error },
          todo: 'later',
          nesting: 1,
          name: 'x',
        }),
      ),
    ).toStrictEqual({ record: { kind: 'todo', failed: true }, error })
    expect(
      read(createEvent('test:pass', { todo: true, name: 's' })),
    ).toStrictEqual({
      record: { failed: false, kind: 'todo' },
      error: undefined,
    })
  })

  it('reads no todo failure caused by a failed member that is not todo', () => {
    let read = createReportReader()

    expect(read(createEvent('test:start', { name: 's' }))).toBeNull()
    expect(
      read(createEvent('test:start', { name: 'in', nesting: 1 })),
    ).toBeNull()
    expect(
      read(createEvent('test:start', { nesting: 2, name: 'x' })),
    ).toBeNull()
    expect(
      read(createEvent('test:fail', { nesting: 2, name: 'x' }))?.record,
    ).toStrictEqual({ kind: 'failure' })
    expect(
      read(createEvent('test:fail', { todo: true, name: 'in', nesting: 1 })),
    ).toBeNull()
    expect(read(createEvent('test:fail', { todo: true, name: 's' }))).toBeNull()
    expect(read(createEvent('test:start', { name: 't' }))).toBeNull()
    expect(
      read(createEvent('test:fail', { todo: true, name: 't' }))?.record,
    ).toStrictEqual({ kind: 'todo', failed: true })
  })

  it('reads failed tests and suites that are not todo', () => {
    let read = createReportReader()
    let error = new Error('wrapped')

    expect(
      read(createEvent('test:fail', { details: { error } })),
    ).toStrictEqual({ record: { kind: 'failure' }, error })
    expect(
      read(createEvent('test:fail', { todo: false }))?.record,
    ).toStrictEqual({ kind: 'failure' })
    expect(
      read(createEvent('test:fail', { name: '/p/a.test.js', nesting: 1 }))
        ?.record,
    ).toStrictEqual({ kind: 'failure' })
  })

  it('reads nothing from other events', () => {
    let read = createReportReader()

    expect(read(createEvent('test:pass'))).toBeNull()
    expect(read(createEvent('test:pass', { name: '/p/a.test.js' }))).toBeNull()
    expect(
      read({
        data: { file: '/p/a.test.js', message: 'x', nesting: 0 },
        type: 'test:diagnostic',
      } as TestEvent),
    ).toBeNull()
  })
})
