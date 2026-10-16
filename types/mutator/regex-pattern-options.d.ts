/**
 * Options of the regex-pattern mutator. Each turns on noisier changes that
 * `strict` adds.
 */
export interface RegexPatternOptions {
  /**
   * Whether an alternative is removed also from a list of more than eight.
   */
  largeAlternations: boolean

  /**
   * Whether a class element is removed and a class range is narrowed by one
   * character at each end.
   */
  classMembers: boolean

  /**
   * Whether a quantifier is narrowed (`x+` to `x`, `x*` to `x?`) and its bounds
   * are moved by one.
   */
  quantifiers: boolean

  /**
   * Whether classes and escapes are negated (`[a]` and `[^a]`, `\d` and `\D`,
   * `\p{L}` and `\P{L}`) and `\.` becomes `.`.
   */
  negations: boolean
}
