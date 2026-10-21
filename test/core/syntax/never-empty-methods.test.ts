import { describe, expect, it } from 'vitest'

import { NEVER_EMPTY_METHODS } from '../../../core/syntax/never-empty-methods'

/**
 * A valid date: the start of the epoch.
 */
let epoch = new Date(0)

/**
 * An invalid date.
 */
let invalid = new Date(Number.NaN)

/**
 * Calls of the built-in methods on edge values: zeros, NaN, infinities and
 * invalid dates.
 */
let calls: Record<string, (() => string)[]> = {
  toPrecision: [
    () => (0).toPrecision(),
    () => (-0.0001).toPrecision(1),
    () => Number.POSITIVE_INFINITY.toPrecision(3),
  ],
  toFixed: [
    () => (0).toFixed(0),
    () => (-0).toFixed(2),
    () => Number.NaN.toFixed(0),
    () => (1e21).toFixed(2),
  ],
  toExponential: [
    () => (0).toExponential(),
    () => Number.NaN.toExponential(2),
    () => (-0).toExponential(),
  ],
  toUTCString: [() => epoch.toUTCString(), () => invalid.toUTCString()],
  toISOString: [() => epoch.toISOString()],
}

describe('nEVER_EMPTY_METHODS', () => {
  it('lists the date and number formatters', () => {
    expect([...NEVER_EMPTY_METHODS].toSorted()).toStrictEqual(
      Object.keys(calls).toSorted(),
    )
  })

  it.each(Object.entries(calls))(
    'gets a non-empty string from %s',
    (_name, results) => {
      for (let call of results) {
        expect(call()).not.toBe('')
      }
    },
  )

  it('gets no string at all from toISOString of an invalid date', () => {
    expect(() => invalid.toISOString()).toThrow(RangeError)
  })
})
