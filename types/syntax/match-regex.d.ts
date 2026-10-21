import type { RegExpLiteral } from 'oxc-parser'

/**
 * Regular expression literal that a call runs to match a string, with the
 * method of the call.
 */
export interface MatchRegex {
  /**
   * Method that runs the regular expression: `exec` of the regular expression,
   * or `match` of the string, which is recognized by name.
   */
  method: 'match' | 'exec'

  /**
   * Regular expression literal, written in the call or as the initializer that
   * always gives a name its value.
   */
  literal: RegExpLiteral
}
