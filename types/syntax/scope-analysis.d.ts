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
}
