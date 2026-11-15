import type { Vitest } from 'vitest/node'
import type { TestError } from 'vitest'

import { deserialize, serialize } from 'node:v8'

import type { VitestStray } from './types/vitest-worker'

import { getErrorMessage } from '../shared/get-error-message'

/**
 * Callback of the root configuration that tells whether an unhandled error
 * counts (`onUnhandledError`).
 */
type ErrorFilter = NonNullable<Vitest['state']['onUnhandledError']>

/**
 * Error as Vitest's main process passes it to `onUnhandledError`.
 */
type ReportedError = { type: string } & TestError

/**
 * Most calls of `onUnhandledError` for one unhandled error and what the
 * callback throws in turn. A plain run follows such a chain while the worker
 * runs, so a longer one counts as endless, which keeps nothing.
 */
const CALL_LIMIT = 100

/**
 * Reads the unhandled errors a worker recorded (`encodeStray`) and keeps those
 * that fail a plain run, as Vitest's main process decides: none when the root
 * configuration sets `dangerouslyIgnoreUnhandledErrors`; otherwise every error
 * but a skip that a test asked for outside its own flow (`VITEST_PENDING`),
 * which Vitest applies to the test instead, and those that `onUnhandledError`
 * of the root configuration drops (`decideStray`). Each error is decided once:
 * a decision of an earlier read, or of another copy of the error, is reused, so
 * a callback runs once per error, as in Vitest.
 *
 * @param vitest - Vitest instance of the session.
 * @param strays - Unhandled errors as the worker recorded them.
 * @param decisions - Decisions of the errors of the same out file, by number,
 *   which receives the new ones.
 * @returns First lines of the errors that count, at most 200 code units each,
 *   in order.
 */
export function readStrays(
  vitest: Vitest,
  strays: readonly VitestStray[],
  decisions: Map<number, string | null>,
): string[] {
  if (vitest.config.dangerouslyIgnoreUnhandledErrors) {
    return []
  }
  let messages: string[] = []
  for (let stray of strays) {
    let message = decisions.get(stray.id)
    if (message === undefined) {
      message = decideStray(vitest.state.onUnhandledError, stray)
      decisions.set(stray.id, message)
    }
    if (message !== null) {
      messages.push(message)
    }
  }
  return messages
}

/**
 * Builds what Vitest's worker reports when the main process sends it back what
 * `onUnhandledError` threw. The value goes through `node:v8`, as the IPC of the
 * forks pool sends it, which keeps every field of a plain object but only the
 * message, stack and cause of an error, with the prototype of a built-in error
 * type. Vitest then serializes it: an error becomes an object of every property
 * along its prototype chain, functions as `Function<name>`, and an object gets
 * the name of the running test and the path of the test file, taken here from
 * the error the callback threw on. A value `node:v8` cannot send stops a plain
 * run with that failure, which the callback never gets.
 *
 * @param thrown - What the callback threw.
 * @param before - Error the callback threw on, as it got it.
 * @returns Error the callback gets next, or the first line of the failure that
 *   stops a plain run.
 */
function reportThrown(
  thrown: unknown,
  before: ReportedError,
): ReportedError | string {
  let sent: unknown
  try {
    sent = deserialize(serialize(thrown))
  } catch (error) {
    return getErrorMessage(error)
  }
  if (sent instanceof Error) {
    let copy: Record<string, unknown> = {}
    for (
      let link: object | null = sent;
      link !== null && link !== Object.prototype;
      link = Reflect.getPrototypeOf(link)
    ) {
      for (let key of Object.getOwnPropertyNames(link)) {
        if (!Object.hasOwn(copy, key)) {
          let value: unknown = Reflect.get(sent, key)
          copy[key] =
            typeof value === 'function' ? `Function<${value.name}>` : value
        }
      }
    }
    sent = copy
  }
  if (typeof sent === 'object' && sent !== null) {
    Object.assign(sent, {
      VITEST_TEST_NAME: before['VITEST_TEST_NAME'],
      VITEST_TEST_PATH: before['VITEST_TEST_PATH'],
    })
  }
  return describeError(sent, 'Unhandled Rejection')
}

/**
 * Decides one unhandled error as Vitest's main process does. A skip that a test
 * asked for outside its own flow does not count. The callback, if set, gets
 * what Vitest's gets (`describeError`); an aggregate error stays one error, as
 * Vitest splits only `Error` instances and a worker's error reaches it
 * serialized. A callback that throws drops the error, but Vitest sends what it
 * threw back to the worker, which reports it as a new unhandled rejection
 * (`reportThrown`): the callback decides that one in turn, and the first call
 * that returns decides.
 *
 * @param filter - `onUnhandledError` of the root configuration, if set.
 * @param stray - Unhandled error as the worker recorded it.
 * @returns First line of the error that counts, or null.
 */
function decideStray(
  filter: ErrorFilter | undefined,
  stray: VitestStray,
): string | null {
  let decoded: unknown = deserialize(Buffer.from(stray.error, 'base64'))
  let reported = describeError(decoded, stray.type)
  let message = getErrorMessage(decoded)
  for (let call = 0; call < CALL_LIMIT; call += 1) {
    if (reported['code'] === 'VITEST_PENDING') {
      return null
    }
    if (!filter) {
      return message
    }
    try {
      return filter(reported) === false ? null : message
    } catch (error) {
      let next = reportThrown(error, reported)
      if (typeof next === 'string') {
        return next
      }
      reported = next
      message = getErrorMessage(error)
    }
  }
  return null
}

/**
 * Builds what Vitest's main process passes to `onUnhandledError`: the error as
 * Vitest serialized it in the worker, with its `type` set; a reason that is not
 * an object comes as `{ type, message }`.
 *
 * @param error - Error as Vitest serialized it, or a reason that is not an
 *   object.
 * @param type - Event of the error, as Vitest names it.
 * @returns Error for the callback.
 */
function describeError(error: unknown, type: string): ReportedError {
  return (
    typeof error === 'object' && error !== null ?
      Object.assign(error, { type })
    : { message: error, type }) as ReportedError
}
