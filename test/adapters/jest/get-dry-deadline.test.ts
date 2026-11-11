import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'

import { getDryDeadline } from '../../../adapters/jest/get-dry-deadline'

/**
 * Budgets of the dry run in these tests.
 */
let timeouts = { file: 3000, test: 500 }

/**
 * Builds a `try` record.
 *
 * @param time - Time of the record.
 * @param fields - Name and occurrence of the test, when they differ.
 * @returns The record of the attempt that ended.
 */
function attempt(
  time: number,
  fields: { occurrence?: number; name?: string } = {},
): JestTimedRecord {
  return {
    timedOut: false,
    reached: false,
    failed: false,
    occurrence: 0,
    message: null,
    covers: null,
    realm: null,
    duration: 0,
    kind: 'try',
    name: 'a',
    hits: 0,
    time,
    ...fields,
  }
}

/**
 * Builds an `open` record of a test with a timeout of 5000 ms.
 *
 * @param time - Time of the record.
 * @param fields - Name, occurrence and timeout of the test, when they differ.
 * @returns The record of the attempt that started.
 */
function open(
  time: number,
  fields: { occurrence?: number; timeout?: number; name?: string } = {},
): JestTimedRecord {
  return {
    timeout: 5000,
    occurrence: 0,
    kind: 'open',
    name: 'a',
    time,
    ...fields,
  }
}

describe('getDryDeadline', () => {
  it('gives the file budget from the send with no records', () => {
    expect(getDryDeadline([], 100, timeouts)).toBe(3100)
  })

  it('gives the test budget and the own timeout inside a test', () => {
    expect(getDryDeadline([open(200)], 100, timeouts)).toBe(5700)
  })

  it('gives a hook its own timeout and the file budget outside a test', () => {
    expect(
      getDryDeadline(
        [{ kind: 'beat', timeout: 900, time: 200 }],
        100,
        timeouts,
      ),
    ).toBe(4100)
  })

  it('adds the timeout of a hook to the own timeout of the test it runs in', () => {
    expect(
      getDryDeadline(
        [
          open(200, { timeout: 20_000 }),
          { kind: 'beat', timeout: 900, time: 300 },
        ],
        100,
        timeouts,
      ),
    ).toBe(21_700)
  })

  it('gives the file budget from the last record between tests', () => {
    expect(getDryDeadline([open(200), attempt(400)], 100, timeouts)).toBe(3400)
  })

  it('gives concurrent tests the longest own timeout of those still running', () => {
    expect(
      getDryDeadline(
        [open(200, { timeout: 20_000 }), open(210, { name: 'b' })],
        100,
        timeouts,
      ),
    ).toBe(20_710)
    expect(
      getDryDeadline(
        [open(200), open(210, { timeout: 20_000, name: 'b' }), attempt(400)],
        100,
        timeouts,
      ),
    ).toBe(20_900)
    expect(
      getDryDeadline(
        [
          open(200, { timeout: 20_000 }),
          open(210, { name: 'b' }),
          attempt(400),
        ],
        100,
        timeouts,
      ),
    ).toBe(5900)
  })

  it('tells two occurrences of a name apart', () => {
    expect(
      getDryDeadline(
        [
          open(200),
          open(210, { occurrence: 1 }),
          attempt(400, { occurrence: 1 }),
        ],
        100,
        timeouts,
      ),
    ).toBe(5900)
  })

  it('does not let a late try, which has no open, take the count below zero', () => {
    expect(
      getDryDeadline(
        [open(200), attempt(300), attempt(400), open(500)],
        100,
        timeouts,
      ),
    ).toBe(6000)
    expect(getDryDeadline([attempt(400), attempt(450)], 100, timeouts)).toBe(
      3450,
    )
  })
})
