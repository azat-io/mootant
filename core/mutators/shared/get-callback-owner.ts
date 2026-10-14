import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { getTypeView } from './get-type-view'

/**
 * Method that calls a comparator: `sort`, which sorts its receiver in place, or
 * `toSorted`, which returns a sorted copy.
 */
export type CallbackOwner = 'toSorted' | 'sort'

/**
 * Finds the method whose comparator a function is (catalog 2.2, O12): the
 * function is, through wrappers, the first argument of a call of `sort` or
 * `toSorted` that method-call removes in `recommended`, a non-computed member
 * callee whose receiver is not `super` and has type `array` or unknown. Only
 * the sign of a comparator's result matters.
 *
 * @param node - Function or arrow function of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns `sort` or `toSorted`, or null.
 */
export function getCallbackOwner(
  node: Node,
  context: MutatorContext,
): CallbackOwner | null {
  let { parent, index, key } = context.syntax.getContextSlot(node)
  if (key !== 'arguments' || index !== 0 || parent?.type !== 'CallExpression') {
    return null
  }
  let { callee } = parent
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    callee.object.type === 'Super'
  ) {
    return null
  }
  let { type } = getTypeView(context.hints.getType(callee.object))
  if (type !== 'array' && type !== 'unknown') {
    return null
  }
  switch (callee.property.name) {
    case 'toSorted':
    case 'sort':
      return callee.property.name
    default:
      return null
  }
}
