import type { AST } from '@eslint-community/regexpp'
import type { Node } from 'oxc-parser'

/**
 * Regular expression of the file whose pattern is known, read for a regex
 * mutator: a literal, or the string argument of a `RegExp` call.
 */
export interface RegexSource {
  /**
   * How the pattern is written, which decides how new pattern text is printed:
   * between the slashes of a literal, in a string literal, in a template
   * literal, or in a `String.raw` template, whose text is the pattern as it
   * is.
   */
  form: 'template' | 'literal' | 'string' | 'raw'

  /**
   * Offset in the file of the source text of every code unit of the pattern,
   * and the offset just past the pattern text at the end. The units an escape
   * sequence or a surrogate pair writes share the offset where it starts.
   */
  offsets: readonly number[]

  /**
   * Flags argument of a `RegExp` call, a string or a template literal without
   * expressions; null for a literal and for a call without flags.
   */
  flagsNode: Node | null

  /**
   * Pattern tree; its offsets are relative to the pattern.
   */
  tree: AST.Pattern

  /**
   * Expression whose value is the regular expression: the literal or the
   * `RegExp` call.
   */
  expression: Node

  /**
   * Whether the pattern is a template literal with expressions. Its pattern and
   * tree stand for the template with `(?:)` in place of every expression, and
   * only an anchor at its start or end may be removed.
   */
  dynamic: boolean

  /**
   * Pattern as the regular expression sees it.
   */
  pattern: string

  /**
   * Flags, such as `gi`.
   */
  flags: string

  /**
   * Text of the file, which new literals are spliced from.
   */
  code: string

  /**
   * Node that holds the pattern and that a pattern change replaces: the
   * literal, the string or template literal, or the `String.raw` call.
   */
  node: Node
}
