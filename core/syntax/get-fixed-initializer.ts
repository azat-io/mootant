import type { VariableDeclarator, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { Binding } from '../../types/syntax/binding'

import { getBindingClosure } from './get-binding-closure'

/**
 * Finds the initializer that always gives a name its value: the initializer of
 * the `const` declarator, or of the `let` declarator that nothing writes, that
 * declares the name as a whole, unless the binding is open (see
 * `getBindingClosure`).
 *
 * @param scopes - Scope analysis of the program.
 * @param shared - Scopes of the program whose names code outside them may read
 *   and write (see `getSharedScopes`).
 * @param binding - Binding of the name.
 * @returns The initializer, or null for any other name.
 */
export function getFixedInitializer(
  scopes: ScopeAnalysis,
  shared: ReadonlySet<Node>,
  binding: Binding,
): Node | null {
  if (
    (binding.kind !== 'const' &&
      (binding.kind !== 'let' || binding.writes.length > 0)) ||
    getBindingClosure(scopes, shared, binding) === 'open'
  ) {
    return null
  }
  let declarator = binding.declaration as VariableDeclarator
  return declarator.id === binding.identifier ? declarator.init : null
}
