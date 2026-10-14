import type { Node } from 'oxc-parser'

/**
 * Name declared in the file.
 */
export interface Binding {
  /**
   * How the name is declared. An `await using` declaration is `using`.
   */
  kind:
    | 'parameter'
    | 'namespace'
    | 'function'
    | 'import'
    | 'catch'
    | 'class'
    | 'const'
    | 'using'
    | 'enum'
    | 'let'
    | 'var'

  /**
   * Identifiers that refer to the name, in source order: reads and write
   * targets. The identifier that declares the name is not one of them.
   */
  references: Node[]

  /**
   * Node that declares the name: a variable declarator, function, class, import
   * specifier, catch clause, enum or namespace; the root parameter node for a
   * parameter.
   */
  declaration: Node

  /**
   * Identifier that introduces the name.
   */
  identifier: Node

  /**
   * Writes of the name anywhere in the file, in source order: every assignment
   * expression whose target is the name or a pattern that contains it (the
   * whole expression), every update expression of it, and the `left` of a
   * `for...in` or `for...of` head that assigns it without declaring it.
   */
  writes: Node[]

  /**
   * Node that owns the scope of the name: the Program, a function, a block, a
   * loop head, a switch, a catch clause, a static block or a namespace body.
   */
  scope: Node
}
