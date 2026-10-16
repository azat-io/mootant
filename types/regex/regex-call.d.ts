import type { Node } from 'oxc-parser'

/**
 * Call of the global `RegExp`, with or without `new`, whose flags are known.
 */
export interface RegexCall {
  /**
   * Flags argument, a string or a template literal without expressions, or null
   * when the call has none.
   */
  flagsNode: Node | null

  /**
   * First argument, without parentheses and TypeScript expression wrappers: a
   * string literal, a template literal, or a `String.raw` template without
   * expressions.
   */
  pattern: Node

  /**
   * Flags, such as `gi`; empty when the call has none.
   */
  flags: string

  /**
   * The call or `new` expression.
   */
  call: Node
}
