import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'

import { getUnitDeadline } from '../../../adapters/jest/get-unit-deadline'

/**
 * Limits of the units of these tests.
 */
let limits = { hitLimit: 1000, timeout: 500 }

/**
 * Builds a `finish` record.
 *
 * @param time - Epoch milliseconds.
 * @returns The record.
 */
function createFinish(time: number): JestTimedRecord {
  return {
    failureMessage: null,
    consoleOutput: null,
    outcome: 'result',
    execError: null,
    kind: 'finish',
    transforms: [],
    variables: [],
    message: null,
    tracked: true,
    snapshots: 0,
    outside: [],
    realm: null,
    loaded: [],
    covers: [],
    writes: [],
    dirty: [],
    reads: [],
    lines: {},
    hits: 0,
    time,
  }
}

/**
 * Builds a `load` record.
 *
 * @param time - Epoch milliseconds.
 * @returns The record.
 */
function createLoad(time: number): JestTimedRecord {
  return { kind: 'load', covers: [], hits: 0, time }
}

/**
 * Builds a `reached` record.
 *
 * @param time - Epoch milliseconds.
 * @returns The record.
 */
function createReach(time: number): JestTimedRecord {
  return { kind: 'reached', hits: 1, time }
}

describe('getUnitDeadline', () => {
  it('gives a unit with no records its timeout and the grace from when it was sent', () => {
    expect(getUnitDeadline([], 1000, limits)).toBe(61_500)
  })

  it('takes no budget from a load with no reach', () => {
    expect(getUnitDeadline([createLoad(1100)], 1000, limits)).toBe(61_500)
  })

  it('takes no budget from a reach while the file loads', () => {
    expect(getUnitDeadline([createReach(1100)], 1000, limits)).toBe(61_500)
  })

  it('starts the budget at the reach once the file loaded', () => {
    expect(
      getUnitDeadline([createLoad(1100), createReach(1200)], 1000, limits),
    ).toBe(1700)
  })

  it('starts the budget at the end of the load for a reach before it', () => {
    expect(
      getUnitDeadline([createReach(1100), createLoad(1300)], 1000, limits),
    ).toBe(1800)
  })

  it('gives a worker the grace past finish, past the budget of the unit', () => {
    expect(
      getUnitDeadline(
        [createLoad(1100), createReach(1200), createFinish(9000)],
        1000,
        limits,
      ),
    ).toBe(69_000)
  })

  it('gives a worker the grace past finish in a unit with no reach', () => {
    expect(getUnitDeadline([createFinish(1400)], 1000, limits)).toBe(61_400)
  })
})
