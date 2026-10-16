import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { TextEdit } from '../../types/source/text-edit'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { isValuePosition } from '../syntax/is-value-position'
import { getReplacementKind } from './get-replacement-kind'

/**
 * Statement lists by the type of the node that holds them, with the key of the
 * list.
 */
let statementListKeys = new Map<string, string>([
  ['SwitchCase', 'consequent'],
  ['BlockStatement', 'body'],
  ['TSModuleBlock', 'body'],
  ['StaticBlock', 'body'],
  ['Program', 'body'],
])

/**
 * Keys of single statements by the type of the node that holds them.
 */
let statementSlotKeys = new Map<string, string[]>([
  ['IfStatement', ['consequent', 'alternate']],
  ['DoWhileStatement', ['body']],
  ['LabeledStatement', ['body']],
  ['ForInStatement', ['body']],
  ['ForOfStatement', ['body']],
  ['WhileStatement', ['body']],
  ['WithStatement', ['body']],
  ['ForStatement', ['body']],
])

/**
 * Checks that the mutant switch can wrap the node a replacement targets: the
 * node holds runtime code, is a statement or an expression, sits in a value
 * position when it is an expression, and sits in a statement position other
 * than the body of a labeled statement when it is a statement. A focus, when
 * given, must lie inside the node.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node the replacement targets.
 * @param focus - Edit inside the node that reports show, if any.
 * @returns The violation, worded to follow `Mutator "<id>" `, or null when the
 *   target is valid.
 */
export function validateReplacement(
  tree: TreeIndex,
  node: Node,
  focus?: TextEdit,
): string | null {
  let slot = tree.slots.get(node)
  if (!slot) {
    return 'returned a replacement for a node outside the runtime code of the file.'
  }
  let kind = getReplacementKind(node)
  if (kind === null) {
    return `cannot replace a ${node.type} node; replace an expression or a statement.`
  }
  if (kind === 'expression' && !isValuePosition(tree, node)) {
    return `cannot replace a ${node.type} node in a position the mutant switch cannot wrap.`
  }
  if (kind === 'block' && !isStatementPosition(slot)) {
    return `cannot replace a ${node.type} node in a position the mutant switch cannot wrap.`
  }
  if (
    kind === 'block' &&
    slot.parent!.type === 'LabeledStatement' &&
    slot.key === 'body'
  ) {
    return 'cannot replace the body of a labeled statement; replace the LabeledStatement.'
  }
  if (
    focus &&
    (focus.start < node.start ||
      focus.end < focus.start ||
      node.end < focus.end)
  ) {
    return 'returned a focus outside the node it replaces.'
  }
  return null
}

/**
 * Tells whether a slot holds a statement in a statement position: an element of
 * a statement list, or the single statement of an `if` branch, a loop body, a
 * labeled body or a `with` body. Function bodies, `try` blocks, `catch` bodies
 * and `finally` blocks are not statement positions.
 *
 * @param slot - Raw slot of the node.
 * @returns Whether an `if`/`else` may replace the node.
 */
function isStatementPosition(slot: NodeSlot): boolean {
  let { parent, index, key } = slot
  if (index !== null) {
    return statementListKeys.get(parent!.type) === key
  }
  return statementSlotKeys.get(parent!.type)?.includes(key!) ?? false
}
