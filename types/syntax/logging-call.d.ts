import type { SourceRange } from '../source/source-range'

/**
 * Logging call of a file, with the mutants that can only change the text it
 * writes, which are skipped.
 */
export interface LoggingCall {
  /**
   * Expression statement whose expression, through parentheses and TypeScript
   * wrappers, is the call, when removing it can only remove the text: every
   * argument is plain (see `isPlainMessage`), none followed by another one may
   * hold a format directive (see `isFormatFree`), and the callee is a method of
   * the global console, which cannot throw (see `isConsoleCall`); null
   * otherwise.
   */
  statement: SourceRange | null

  /**
   * Literal text of the arguments (see `findMessageTexts`), except of one that
   * is followed by another argument and may hold a format directive (see
   * `isFormatFree`).
   */
  texts: SourceRange[]
}
