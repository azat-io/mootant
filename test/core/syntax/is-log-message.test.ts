import { describe, expect, it } from 'vitest'

import type { LoggingCall } from '../../../types/syntax/logging-call'

import { isLogMessage } from '../../../core/syntax/is-log-message'

/**
 * Logging call `console.info('a', x)` at 10-28 in the statement 10-29, whose
 * text is the string 23-26 and whose removal only removes the text.
 */
let statementCall: LoggingCall = {
  statement: { start: 10, end: 29 },
  texts: [{ start: 23, end: 26 }],
}

/**
 * Logging call `log(f())` at 40-48, whose argument is not plain, so its
 * statement 40-49 is not a message either.
 */
let effectCall: LoggingCall = {
  statement: null,
  texts: [],
}

describe('isLogMessage', () => {
  it.each([
    { range: { start: 23, end: 26 }, expected: true },
    { range: { start: 24, end: 25 }, expected: false },
    { range: { start: 22, end: 26 }, expected: false },
    { range: { start: 10, end: 28 }, expected: false },
    { range: { start: 10, end: 17 }, expected: false },
    { range: { start: 44, end: 47 }, expected: false },
  ])('tells whether $range is a message text', ({ expected, range }) => {
    expect(isLogMessage([statementCall, effectCall], range, false)).toBe(
      expected,
    )
  })

  it('takes a statement mutant of the statement of a call', () => {
    let calls = [statementCall, effectCall]

    expect(isLogMessage(calls, { start: 10, end: 29 }, true)).toBe(true)
    expect(isLogMessage(calls, { start: 10, end: 29 }, false)).toBe(false)
    expect(isLogMessage(calls, { start: 40, end: 49 }, true)).toBe(false)
  })
})
