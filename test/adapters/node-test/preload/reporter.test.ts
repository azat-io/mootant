import type { TestEvent } from 'node:test/reporters'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'

import type { NodeTestReport } from '../../../../adapters/node-test/types/node-test-record'

/**
 * Error of the failed todo test.
 */
const ERROR = new Error('x')

/**
 * Events of a test file: a passed test and a failed todo test.
 */
const EVENTS = [
  {
    data: { file: '/p/a.test.js', details: {}, nesting: 0, name: 'a' },
    type: 'test:pass',
  },
  {
    data: {
      details: { error: ERROR },
      file: '/p/a.test.js',
      nesting: 0,
      todo: true,
      name: 'b',
    },
    type: 'test:fail',
  },
] as TestEvent[]

/**
 * Runs a fresh reporter over the events, as node:test pipes them.
 *
 * @returns What it wrote.
 */
async function runReporter(): Promise<string[]> {
  let { default: reporter } =
    await import('../../../../adapters/node-test/preload/reporter')
  let output: string[] = []
  for await (let text of Readable.from(EVENTS).pipe(reporter)) {
    output.push(String(text))
  }
  return output
}

describe('reporter', () => {
  afterEach(() => {
    vi.resetModules()
    Reflect.deleteProperty(globalThis, Symbol.for('mootant.reported'))
  })

  it('passes its records to the receiver and writes no output', async () => {
    let reported = vi.fn<(record: NodeTestReport, error: unknown) => void>()
    Reflect.set(globalThis, Symbol.for('mootant.reported'), reported)

    await expect(runReporter()).resolves.toStrictEqual([])
    expect(reported).toHaveBeenCalledExactlyOnceWith(
      { kind: 'todo', failed: true },
      ERROR,
    )
  })

  it('does nothing without the receiver', async () => {
    await expect(runReporter()).resolves.toStrictEqual([])
  })
})
