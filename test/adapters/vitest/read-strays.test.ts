import { describe, expect, it, vi } from 'vitest'

import { encodeStray } from '../../../adapters/vitest/worker/encode-stray'
import { readStrays } from '../../../adapters/vitest/read-strays'

/**
 * Builds the Vitest instance of a session as `readStrays` reads it.
 *
 * @param ignored - Whether the root configuration sets
 *   `dangerouslyIgnoreUnhandledErrors`.
 * @param onUnhandledError - `onUnhandledError` of the root configuration, if
 *   any.
 * @returns Vitest instance.
 */
function createVitest(ignored: boolean, onUnhandledError?: unknown): never {
  return {
    config: { dangerouslyIgnoreUnhandledErrors: ignored },
    state: { onUnhandledError },
  } as never
}

/**
 * Encodes unhandled errors as a worker numbers them, from 0.
 *
 * @param errors - Errors with the names of their events.
 * @returns Unhandled errors as the worker recorded them.
 */
function encodeAll(
  errors: [error: unknown, type: string][],
): ReturnType<typeof encodeStray>[] {
  return errors.map(([error, type], index) => encodeStray(error, type, index))
}

describe('readStrays', () => {
  it('keeps the first line of every unhandled error when no callback is set, as Vitest does for a value that is not a function', () => {
    let strays = encodeAll([
      [{ message: 'boom\n    at f' }, 'Uncaught Exception'],
      ['text', 'Unhandled Rejection'],
      [undefined, 'Unhandled Rejection'],
      [10n, 'Unhandled Rejection'],
    ])
    let messages = ['boom', 'text', 'undefined', '10']

    expect(readStrays(createVitest(false), strays, new Map())).toStrictEqual(
      messages,
    )
    expect(
      readStrays(createVitest(false, false), strays, new Map()),
    ).toStrictEqual(messages)
  })

  it('keeps none when the configuration ignores unhandled errors', () => {
    let filter = vi.fn()
    let strays = encodeAll([[{ message: 'boom' }, 'Uncaught Exception']])

    expect(
      readStrays(createVitest(true, filter), strays, new Map()),
    ).toStrictEqual([])
    expect(filter).not.toHaveBeenCalled()
  })

  it('drops the errors the callback returns false for, passing what Vitest passes', () => {
    let outcomes = new Map<unknown, boolean>([
      ['dropped', false],
      ['kept', true],
    ])
    let filter = vi.fn((error: { message?: unknown }) =>
      outcomes.get(error.message),
    )
    let strays = encodeAll([
      [{ code: 'ECONNRESET', message: 'dropped' }, 'Uncaught Exception'],
      ['kept', 'Unhandled Rejection'],
      [
        { errors: [{ message: 'inner' }], message: 'other' },
        'Unhandled Rejection',
      ],
    ])

    expect(
      readStrays(createVitest(false, filter), strays, new Map()),
    ).toStrictEqual(['kept', 'other'])
    /**
     * An aggregate error stays one error, as in Vitest.
     */
    expect(filter.mock.calls).toStrictEqual([
      [{ type: 'Uncaught Exception', code: 'ECONNRESET', message: 'dropped' }],
      [{ type: 'Unhandled Rejection', message: 'kept' }],
      [
        {
          errors: [{ message: 'inner' }],
          type: 'Unhandled Rejection',
          message: 'other',
        },
      ],
    ])
  })

  it('decides each error once, reusing the decisions of its copies and of earlier reads', () => {
    let filter = vi.fn(() => false)
    let [first, second] = encodeAll([
      [{ message: 'boom' }, 'Uncaught Exception'],
      [{ message: 'boom' }, 'Uncaught Exception'],
    ])
    let decisions = new Map<number, string | null>([[1, 'kept before']])

    expect(
      readStrays(createVitest(false, filter), [first!, first!], decisions),
    ).toStrictEqual([])
    expect(
      readStrays(createVitest(false, filter), [first!, second!], decisions),
    ).toStrictEqual(['kept before'])
    expect(filter).toHaveBeenCalledExactlyOnceWith({
      type: 'Uncaught Exception',
      message: 'boom',
    })
    expect(decisions).toStrictEqual(
      new Map([
        [1, 'kept before'],
        [0, null],
      ]),
    )
  })

  it('follows what a throwing callback throws until a call returns, as Vitest reports it again', () => {
    let reasons = new Map<unknown, unknown>([
      [undefined, new TypeError('no message')],
      ['quiet', new Error('quiet broke')],
      ['first', new Error('second')],
      ['second', new Error('third')],
      ['text', 'thrown text'],
    ])
    let filter = vi.fn((error: { message?: unknown }) => {
      if (reasons.has(error.message)) {
        throw reasons.get(error.message)
      }
      return error.message !== 'quiet broke'
    })
    let strays = encodeAll([
      [undefined, 'Unhandled Rejection'],
      [{ message: 'quiet' }, 'Uncaught Exception'],
      [{ message: 'first' }, 'Uncaught Exception'],
      [{ message: 'text' }, 'Unhandled Rejection'],
    ])

    /**
     * A plain run reports what the callback threw as a new unhandled rejection,
     * and the first call that returns decides.
     */
    expect(
      readStrays(createVitest(false, filter), strays, new Map()),
    ).toStrictEqual(['no message', 'third', 'thrown text'])
    expect(filter.mock.calls).toMatchObject([
      [{ type: 'Unhandled Rejection', message: undefined }],
      [
        {
          stack: expect.stringContaining('TypeError: no message') as string,
          type: 'Unhandled Rejection',
          message: 'no message',
          name: 'TypeError',
        },
      ],
      [{ type: 'Uncaught Exception', message: 'quiet' }],
      [{ type: 'Unhandled Rejection', message: 'quiet broke', name: 'Error' }],
      [{ type: 'Uncaught Exception', message: 'first' }],
      [{ type: 'Unhandled Rejection', message: 'second', name: 'Error' }],
      [{ type: 'Unhandled Rejection', message: 'third', name: 'Error' }],
      [{ type: 'Unhandled Rejection', message: 'text' }],
      [{ type: 'Unhandled Rejection', message: 'thrown text' }],
    ])
  })

  it('passes what a throwing callback threw with the fields Vitest sends back', () => {
    let reasons = new Map<unknown, unknown>([
      [
        'wrap error',
        Object.assign(new TypeError('wrapped error'), { code: 'IGNORE' }),
      ],
      [
        'holds a function',
        { message: 'holds a function again', run: () => {} },
      ],
      ['wrap me', { message: 'wrapped', code: 'IGNORE' }],
    ])
    let filter = vi.fn((error: { message?: unknown; code?: unknown }) => {
      if (error.code === 'IGNORE') {
        return false
      }
      if (reasons.has(error.message)) {
        throw reasons.get(error.message)
      }
      return true
    })
    let test = { VITEST_TEST_PATH: '/p/a.test.ts', VITEST_TEST_NAME: 'a test' }
    let strays = encodeAll([
      [{ message: 'wrap me', ...test }, 'Uncaught Exception'],
      [{ message: 'wrap error' }, 'Uncaught Exception'],
      [{ message: 'holds a function' }, 'Uncaught Exception'],
    ])

    /**
     * A plain object keeps its fields on the way back, an error keeps only its
     * message and stack, and a value that cannot be sent stops a plain run.
     */
    expect(
      readStrays(createVitest(false, filter), strays, new Map()),
    ).toStrictEqual([
      'wrapped error',
      expect.stringContaining('could not be cloned') as string,
    ])
    expect(filter.mock.calls).toStrictEqual([
      [{ type: 'Uncaught Exception', message: 'wrap me', ...test }],
      [
        {
          type: 'Unhandled Rejection',
          message: 'wrapped',
          code: 'IGNORE',
          ...test,
        },
      ],
      [{ type: 'Uncaught Exception', message: 'wrap error' }],
      [
        {
          stack: expect.stringContaining('TypeError: wrapped error') as string,
          constructor: 'Function<TypeError>',
          toString: 'Function<toString>',
          VITEST_TEST_NAME: undefined,
          VITEST_TEST_PATH: undefined,
          type: 'Unhandled Rejection',
          message: 'wrapped error',
          name: 'TypeError',
        },
      ],
      [{ message: 'holds a function', type: 'Uncaught Exception' }],
    ])
  })

  it('keeps nothing of a callback that never stops throwing', () => {
    let filter = vi.fn(() => {
      throw new Error('always broken')
    })
    let strays = encodeAll([[{ message: 'boom' }, 'Uncaught Exception']])

    expect(
      readStrays(createVitest(false, filter), strays, new Map()),
    ).toStrictEqual([])
    expect(filter).toHaveBeenCalledTimes(100)
  })

  it('leaves a skip that a test asked for outside its flow to Vitest, without the callback', () => {
    let filter = vi.fn()
    let skip = { code: 'VITEST_PENDING', message: 'skipped', taskId: 'a' }

    expect(
      readStrays(
        createVitest(false, filter),
        encodeAll([[skip, 'Uncaught Exception']]),
        new Map(),
      ),
    ).toStrictEqual([])
    expect(filter).not.toHaveBeenCalled()
  })
})
