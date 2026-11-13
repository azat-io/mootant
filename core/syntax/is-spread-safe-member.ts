import type { ObjectPropertyKind, ObjectProperty, Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'
import { walkTree } from '../tree/walk-tree'

/**
 * Key of the member that sets the prototype of an object literal.
 */
const PROTOTYPE_KEY = '__proto__'

/**
 * Tells whether a member of an object literal behaves the same when it is
 * spread from an object literal of its own, as the copy of a literal that the
 * mutant switch runs while the removal of a member is active writes every
 * member with a removal: `{ a, ...(removed ? {} : { b }), c }`. A spread, a
 * data property and a method that cannot reach `super` do. An accessor does
 * not, since a spread reads it and copies its value, nor does a method that
 * uses `super` or calls `eval`, whose code may use it, since its home object
 * would change. A member keyed `__proto__` in any form does not either: written
 * plainly it sets the prototype, which a spread does not copy, and code that
 * lowers spreads to assignments, such as `Object.assign`, turns the other forms
 * into a prototype change too.
 *
 * @param member - Property or spread of an object literal.
 * @returns Whether spreading the member keeps its meaning.
 */
export function isSpreadSafeMember(member: ObjectPropertyKind): boolean {
  if (member.type === 'SpreadElement') {
    return true
  }
  if (member.kind !== 'init' || isPrototypeKey(member)) {
    return false
  }
  return !member.method || !mayUseSuper(member.value)
}

/**
 * Tells whether the key of a property is `__proto__`: a name, or a string or a
 * template literal without substitutions, computed or not, through parentheses
 * and TypeScript wrappers.
 *
 * @param property - Property of an object literal.
 * @returns Whether the key is `__proto__`.
 */
function isPrototypeKey(property: ObjectProperty): boolean {
  let key = unwrapExpression(property.key)
  if (key.type === 'Identifier') {
    return !property.computed && key.name === PROTOTYPE_KEY
  }
  if (key.type === 'TemplateLiteral') {
    return (
      key.expressions.length === 0 &&
      key.quasis[0]!.value.cooked === PROTOTYPE_KEY
    )
  }
  return key.type === 'Literal' && key.value === PROTOTYPE_KEY
}

/**
 * Tells whether the code of a method may use `super`: it does so itself, or
 * calls `eval`, whose code may. The callee is read through parentheses and
 * TypeScript wrappers, such as `eval!(code)`, which is a direct call of `eval`
 * once the types are stripped.
 *
 * @param node - Value of the method.
 * @returns Whether `super` or a call of `eval` occurs in the subtree.
 */
function mayUseSuper(node: Node): boolean {
  let found = false
  walkTree(node, child => {
    let callee =
      child.type === 'CallExpression' ? unwrapExpression(child.callee) : null
    found ||=
      child.type === 'Super' ||
      (callee?.type === 'Identifier' && callee.name === 'eval')
    return !found
  })
  return found
}
