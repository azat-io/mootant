import type { LoggingCall } from '../../types/syntax/logging-call'
import type { SourceRange } from '../../types/source/source-range'

/**
 * Tells whether a mutant of a range can only change the text a logging call
 * writes: one of the literal texts of a call (see `findMessageTexts`) is
 * exactly the range, or, for a statement mutant, the range is the statement of
 * a call whose removal can only remove its text (see `LoggingCall.statement`).
 * Every other mutant inside a logging call, such as one of an operator, a
 * condition, an optional chain or an expression of a template, is not, and
 * neither is an expression mutant of a statement range, such as one of the call
 * of a statement without a semicolon.
 *
 * @param calls - Logging calls of the file.
 * @param range - Range a mutant replaces.
 * @param statement - Whether the mutant replaces a statement.
 * @returns Whether the mutant only changes a log message.
 */
export function isLogMessage(
  calls: readonly LoggingCall[],
  range: SourceRange,
  statement: boolean,
): boolean {
  return calls.some(
    call =>
      call.texts.some(text => isSame(range, text)) ||
      (statement && call.statement !== null && isSame(range, call.statement)),
  )
}

/**
 * Tells whether two ranges cover the same code units.
 *
 * @param range - Range to compare.
 * @param other - Other range.
 * @returns Whether both start and end at the same offsets.
 */
function isSame(range: SourceRange, other: SourceRange): boolean {
  return range.start === other.start && range.end === other.end
}
