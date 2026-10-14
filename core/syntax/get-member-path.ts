import type { MemberExpression, Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Reads the names of an identifier, `this`, `super`, `new.target` or
 * `import.meta`, or of a member chain on one of them: `this.logger.info` gives
 * `this`, `logger` and `info`. Parentheses, TypeScript expression wrappers and
 * optional chains are looked through. A member name is a non-computed
 * identifier, `#name` for a private name, or the value of a computed string
 * literal.
 *
 * @param node - Expression to read.
 * @returns Names from the root of the chain to the outermost member, or null
 *   when a part has no static name.
 */
export function getMemberPath(node: Node): string[] | null {
  let names: string[] = []
  let current = unwrapExpression(node)
  while (
    current.type === 'MemberExpression' ||
    current.type === 'ChainExpression'
  ) {
    if (current.type === 'ChainExpression') {
      current = unwrapExpression(current.expression)
    } else {
      let name = getPropertyName(current)
      if (name === null) {
        return null
      }
      names.push(name)
      current = unwrapExpression(current.object)
    }
  }

  let root = getRootNames(current)
  if (root === null) {
    return null
  }
  return [...root, ...names.toReversed()]
}

/**
 * Reads the static name of the property of a member expression.
 *
 * @param node - Member expression.
 * @returns The property name, `#name` for a private name, or null for a
 *   computed property that is not a string literal.
 */
function getPropertyName(node: MemberExpression): string | null {
  if (!node.computed) {
    let { property } = node
    return property.type === 'PrivateIdentifier' ?
        `#${property.name}`
      : property.name
  }
  let { property } = node
  return property.type === 'Literal' && typeof property.value === 'string' ?
      property.value
    : null
}

/**
 * Reads the names of the root of a member chain.
 *
 * @param node - Root expression of the chain, without wrappers.
 * @returns One name for an identifier, `this` or `super`, two for a meta
 *   property, or null for any other expression.
 */
function getRootNames(node: Node): string[] | null {
  switch (node.type) {
    case 'ThisExpression':
      return ['this']
    case 'MetaProperty':
      return [node.meta.name, node.property.name]
    case 'Identifier':
      return [node.name]
    case 'Super':
      return ['super']
    default:
      return null
  }
}
