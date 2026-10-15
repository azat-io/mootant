import type { VariableDeclarator, MemberExpression, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Properties that hold a size, which is never negative, whatever the receiver.
 * Only `length` counts: arrays, strings, functions and typed arrays have it,
 * and an object with a negative `length` is rare. `size` and `byteLength` are
 * left out, because type hints cannot tell a Map, a Set or an array buffer from
 * any object that may hold a negative `size`.
 */
let sizeProperties = new Set(['length'])

/**
 * Methods that return a position or -1 when nothing is found.
 */
let positionMethods = new Set([
  'findLastIndex',
  'lastIndexOf',
  'findIndex',
  'indexOf',
  'search',
])

/**
 * Finds the smallest value an expression can have when syntax alone tells it: 0
 * for a `length` member, -1 for an `indexOf`, `lastIndexOf`, `findIndex`,
 * `findLastIndex` or `search` call, and the bound of the initializer for a
 * `const` binding or a `let` binding that is never written. Members and methods
 * are recognized by name. An optional chain has no bound, because it may be
 * `undefined`.
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Expression to bound.
 * @returns The lower bound, or null when it is not known.
 */
export function getLowerBound(
  scopes: ScopeAnalysis,
  node: Node,
): number | null {
  let seen = new Set<Node>()
  let current = unwrapExpression(node)
  while (current.type === 'Identifier') {
    let initializer = getFixedInitializer(scopes, current)
    if (initializer === null || seen.has(initializer)) {
      return null
    }
    seen.add(initializer)
    current = unwrapExpression(initializer)
  }

  switch (current.type) {
    case 'MemberExpression':
      return hasPropertyName(current, sizeProperties) ? 0 : null
    case 'CallExpression': {
      let callee = unwrapExpression(current.callee)
      return (
          callee.type === 'MemberExpression' &&
            hasPropertyName(callee, positionMethods)
        ) ?
          -1
        : null
    }
    default:
      return null
  }
}

/**
 * Finds the initializer that always gives an identifier its value: the
 * initializer of the `const` declarator or never-written `let` declarator that
 * declares the name as a whole.
 *
 * @param scopes - Scope analysis of the file.
 * @param identifier - Identifier that refers to or declares a name.
 * @returns The initializer, or null for any other name.
 */
function getFixedInitializer(
  scopes: ScopeAnalysis,
  identifier: Node,
): Node | null {
  let binding = scopes.bindings.get(identifier)
  if (
    binding?.kind !== 'const' &&
    (binding?.kind !== 'let' || binding.writes.length > 0)
  ) {
    return null
  }
  let declarator = binding.declaration as VariableDeclarator
  return declarator.id === binding.identifier ? declarator.init : null
}

/**
 * Tells whether a member has a non-computed property with one of the names.
 *
 * @param node - Member expression.
 * @param names - Accepted property names.
 * @returns Whether the property is an identifier with one of the names.
 */
function hasPropertyName(
  node: MemberExpression,
  names: ReadonlySet<string>,
): boolean {
  return (
    !node.computed &&
    node.property.type === 'Identifier' &&
    names.has(node.property.name)
  )
}
