import type { Node } from 'oxc-parser'

import type { Binding } from './binding'

/**
 * Names declared in a file and what every identifier resolves to.
 */
export interface ScopeAnalysis {
  /**
   * Nodes that declare type parameters, by parameter name, in source order:
   * functions, methods, classes, interfaces and type aliases.
   */
  typeParameters: ReadonlyMap<string, readonly Node[]>

  /**
   * Same-file type alias, interface, class or enum that the name of every
   * resolved type reference refers to, looked up through the scopes around the
   * reference; the first declaration of a name in a scope wins. Names declared
   * elsewhere are missing.
   */
  typeReferences: ReadonlyMap<Node, Node>

  /**
   * Binding of every resolved reference and of every binding identifier.
   * Globals and undeclared names are missing.
   */
  bindings: ReadonlyMap<Node, Binding>

  /**
   * Whether the program has code that may read, write and shadow its names
   * where the analysis does not see it: a direct `eval` call, a `with`
   * statement or a TypeScript namespace that is not ambient. A call may be a
   * direct `eval` when it is not optional and its callee, through parentheses
   * and TypeScript expression wrappers, is the name `eval`, however the file
   * binds that name: the call is direct whenever the name holds the built-in
   * `eval` at run time. Any other call of `eval` runs in the global scope. Any
   * namespace or module declaration that is not ambient makes the program
   * opaque, at any depth, because TypeScript resolves bare names across its
   * bodies and may drop it when it emits no code. A declaration is ambient when
   * it has `declare` or sits in an ambient one, such as a namespace in `declare
   * global`, and its body runs no code.
   */
  opaque: boolean
}
