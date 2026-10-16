import type { SourceRange } from './source-range'

/**
 * Code of a component template that mootant mutates, with how the synthetic
 * module that oxc parses holds it.
 */
export interface TemplateExpression extends SourceRange {
  /**
   * `condition` for an expression whose truthiness the template reads, such as
   * the test of an `#if` block, which the module holds as the test of an `if`
   * statement; `value` for any other expression, which it holds as an array
   * element; `declaration` for a declaration tag such as a `@const` tag, which
   * it holds in a block of its own; `handler` for a Svelte event handler, whose
   * result is discarded, which it holds like a value; `event` for a Vue event
   * handler, which may be a list of statements, which it holds in a block of
   * its own, or in parentheses when it starts with `function`.
   */
  wrap: 'declaration' | 'condition' | 'handler' | 'event' | 'value'

  /**
   * Text that ends the template code around the expression, which no
   * replacement may contain: the quote of a Vue attribute or the `}}` of a Vue
   * interpolation. Vue also decodes character references in both, so a
   * replacement must not contain one. Omitted for Svelte, which reads its
   * expressions as JavaScript.
   */
  delimiter?: '}}' | '"' | "'"
}
