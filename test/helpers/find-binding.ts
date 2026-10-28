import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { Binding } from '../../types/syntax/binding'

/**
 * Finds the first binding of a name.
 *
 * @param scopes - Scope analysis to search.
 * @param name - Declared name.
 * @returns The first binding in declaration order whose identifier is the name.
 * @throws Error - When no binding has the name.
 */
export function findBinding(scopes: ScopeAnalysis, name: string): Binding {
  for (let binding of scopes.bindings.values()) {
    let { identifier } = binding
    if (identifier.type === 'Identifier' && identifier.name === name) {
      return binding
    }
  }
  throw new Error(`No binding named ${name}.`)
}
