import type { JSXOpeningElement, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { TextEdit } from '../../types/source/text-edit'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { isBraceSensitiveAttribute } from '../syntax/is-brace-sensitive-attribute'
import { isPlainAttributeString } from '../text/is-plain-attribute-string'
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
 * than the body of a labeled statement when it is a statement. A quoted JSX
 * attribute value, which is not a value position, is a valid target when it and
 * the text of the replacement are both plain strings (see
 * `isPlainAttributeString`) and a compiler reads its attribute the same way in
 * braces (see `isBraceSensitiveAttribute`): the switch hosts it in braces, and
 * the text written in place of the value still means what the switch runs. A
 * focus, when given, must lie inside the node.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node the replacement targets.
 * @param written - Text of the replacement and the edit inside the node.
 * @param written.focus - Edit inside the node that reports show, if any.
 * @param written.text - Text written in place of the node; without it, a quoted
 *   JSX attribute value is not a valid target.
 * @returns The violation, worded to follow `Mutator "<id>" `, or null when the
 *   target is valid.
 */
export function validateReplacement(
  tree: TreeIndex,
  node: Node,
  written: { focus?: TextEdit; text?: string } = {},
): string | null {
  let slot = tree.slots.get(node)
  if (!slot) {
    return 'returned a replacement for a node outside the runtime code of the file.'
  }
  let kind = getReplacementKind(node)
  if (kind === null) {
    return `cannot replace a ${node.type} node; replace an expression or a statement.`
  }
  if (
    kind === 'expression' &&
    !isValuePosition(tree, node) &&
    !isPlainAttributeChange(node, slot, { text: written.text, tree })
  ) {
    return `cannot replace a ${node.type} node in a position where Mootant cannot switch a mutant on.`
  }
  if (kind === 'block' && !isStatementPosition(slot)) {
    return `cannot replace a ${node.type} node in a position where Mootant cannot switch a mutant on.`
  }
  if (
    kind === 'block' &&
    slot.parent!.type === 'LabeledStatement' &&
    slot.key === 'body'
  ) {
    return 'cannot replace the body of a labeled statement; replace the LabeledStatement.'
  }
  let { focus } = written
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
 * Tells whether a replacement turns a quoted JSX attribute value into another
 * string that JSX and JavaScript read alike, as the value itself is read, of an
 * attribute that a compiler reads the same way in braces.
 *
 * @param node - Node the replacement targets.
 * @param slot - Raw slot of the node.
 * @param written - Runtime tree of the file and the text written in place of
 *   the node, if known.
 * @param written.tree - Runtime tree of the file.
 * @param written.text - Text written in place of the node, if known.
 * @returns Whether the node and the text are both plain attribute strings that
 *   braces keep.
 */
function isPlainAttributeChange(
  node: Node,
  slot: NodeSlot,
  written: { text: undefined | string; tree: TreeIndex },
): boolean {
  let { parent: attribute } = slot
  if (
    attribute?.type !== 'JSXAttribute' ||
    node.type !== 'Literal' ||
    written.text === undefined
  ) {
    return false
  }
  let element = written.tree.slots.get(attribute)!.parent as JSXOpeningElement
  return (
    !isBraceSensitiveAttribute(attribute, element) &&
    isPlainAttributeString(node.raw!) &&
    isPlainAttributeString(written.text)
  )
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
