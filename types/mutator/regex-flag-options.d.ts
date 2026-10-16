/**
 * Options of the regex-flag mutator.
 */
export interface RegexFlagOptions {
  /**
   * Whether `i` is added to a pattern with cased characters, and `g` to the
   * pattern of a `.replace` call.
   */
  additions: boolean
}
