import type { AssignmentExpression, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getEnclosingFunction } from './get-enclosing-function'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { getMemberPath } from './get-member-path'
import { getSlot } from '../tree/get-slot'

/**
 * Callee paths of the Svelte runes that the compiler accepts only as the
 * initializer of a declaration, a class field, a destructuring default or a
 * `this` field assigned in a constructor.
 */
let runePaths = new Set([
  '$derived.by',
  '$state.raw',
  '$props.id',
  '$bindable',
  '$derived',
  '$props',
  '$state',
])

/**
 * Slots that hold an initializer, by the type of the node that holds them.
 */
let initializerKeys = new Map([
  ['PropertyDefinition', 'value'],
  ['VariableDeclarator', 'init'],
  ['AssignmentPattern', 'right'],
])

/**
 * Tells whether a node is a Svelte rune call in an initializer position, such
 * as `$state(0)` in `let count = $state(0)` or in `this.count = $state(0)`
 * inside a constructor, reached directly or through parentheses and TypeScript
 * expression wrappers. The Svelte compiler rejects a rune anywhere else
 * (`state_invalid_placement`), so wrapping the call in the mutant switch would
 * break the whole file. The check is by name.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node is a rune call the compiler must see as it is.
 */
export function isRuneCall(tree: TreeIndex, node: Node): boolean {
  let call = unwrapExpression(node)
  if (call.type !== 'CallExpression') {
    return false
  }
  let path = getMemberPath(call.callee)?.join('.')
  if (path === undefined || !runePaths.has(path)) {
    return false
  }
  let { parent, key } = getContextSlot(tree, node)
  if (parent?.type === 'AssignmentExpression') {
    return key === 'right' && isConstructorField(tree, parent)
  }
  return parent !== null && initializerKeys.get(parent.type) === key
}

/**
 * Tells whether a plain assignment sets a field of `this` inside a class
 * constructor, where Svelte accepts a rune as the assigned value.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Assignment of the runtime tree.
 * @returns Whether the assignment targets `this` in a constructor.
 */
function isConstructorField(
  tree: TreeIndex,
  node: AssignmentExpression,
): boolean {
  if (
    node.operator !== '=' ||
    node.left.type !== 'MemberExpression' ||
    node.left.object.type !== 'ThisExpression'
  ) {
    return false
  }
  let enclosing = getEnclosingFunction(tree, node)
  if (enclosing === null) {
    return false
  }
  let { parent } = getSlot(tree, enclosing)
  return parent?.type === 'MethodDefinition' && parent.kind === 'constructor'
}
