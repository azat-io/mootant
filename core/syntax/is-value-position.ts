import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'
import type { NodeSlot } from '../../types/node-slot'

import { getReplacementKind } from '../generate/get-replacement-kind'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { getChainRoot } from './get-chain-root'
import { getSlot } from '../tree/get-slot'

/**
 * Keys under which a node is the name of a binding, not a value.
 */
let bindingKeys = new Set([
  'parameter',
  'exported',
  'imported',
  'params',
  'local',
  'param',
  'id',
])

/**
 * Parents whose `left` is assigned to.
 */
let assignedLeftTypes = new Set([
  'AssignmentExpression',
  'AssignmentPattern',
  'ForOfStatement',
  'ForInStatement',
])

/**
 * Parents whose operand is assigned to.
 */
let assignedOperandTypes = new Set([
  'UpdateExpression',
  'ArrayPattern',
  'RestElement',
])

/**
 * Nodes that can short-circuit an optional chain.
 */
let chainElementTypes = new Set([
  'TSNonNullExpression',
  'MemberExpression',
  'CallExpression',
])

/**
 * Tells whether a replacement may stand in place of a node: the node is an
 * expression whose value is read, and the mutant switch can wrap it in a
 * conditional expression without changing what the code around it means. Write
 * targets, binding names, non-computed keys and member properties, labels,
 * shorthand property values, method values, `delete` operands, `typeof`
 * identifiers, template parts of tagged templates, callee or tag expressions
 * that carry `this`, short-circuiting elements of optional chains, JSX
 * attribute values and JSX children are rejected.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node can be the target of an expression replacement.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isValuePosition(tree: TreeIndex, node: Node): boolean {
  let slot = getSlot(tree, node)
  let context = getContextSlot(tree, node)
  return (
    getReplacementKind(node) === 'expression' &&
    !isWriteTarget(tree, context) &&
    !isNameSlot(slot, context) &&
    !isSourceShape(node, slot) &&
    !isFormSensitiveOperand(node, context) &&
    !isShortCircuitElement(tree, node)
  )
}

/**
 * Tells whether a node is an element of an optional chain that an optional link
 * at or below it can skip: replacing it would no longer skip the rest of the
 * chain.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node to check.
 * @returns Whether the node is a short-circuiting element of a chain.
 */
function isShortCircuitElement(tree: TreeIndex, node: Node): boolean {
  if (!chainElementTypes.has(node.type) || !getChainRoot(tree, node)) {
    return false
  }
  let current = node
  for (;;) {
    switch (current.type) {
      case 'TSNonNullExpression':
        current = current.expression
        break
      case 'MemberExpression':
        if (current.optional) {
          return true
        }
        current = current.object
        break
      case 'CallExpression':
        if (current.optional) {
          return true
        }
        current = current.callee
        break
      default:
        return false
    }
  }
}

/**
 * Tells whether the source text of a node is not an expression on its own: a
 * shorthand property value, a method value, a JSX attribute value or a JSX
 * child.
 *
 * @param node - Node to check.
 * @param slot - Slot of the node through parentheses.
 * @returns Whether a conditional expression cannot replace the text.
 */
function isSourceShape(node: Node, slot: NodeSlot): boolean {
  let { parent, key } = slot
  switch (parent?.type) {
    case 'MethodDefinition':
      return key === 'value'
    case 'JSXAttribute':
      return key === 'value'
    case 'JSXFragment':
    case 'JSXElement':
      return key === 'children'
    case 'Property':
      return (
        key === 'value' &&
        (parent.shorthand ||
          (node.type === 'FunctionExpression' &&
            (parent.method || parent.kind !== 'init')))
      )
    default:
      return false
  }
}

/**
 * Tells whether a node is an operand whose meaning depends on its exact form:
 * the operand of `delete`, an identifier under `typeof`, the template of a
 * tagged template, or a callee or tag that passes `this` or is `eval`.
 *
 * @param node - Node to check.
 * @param context - Context slot of the node.
 * @returns Whether a conditional expression in place of the node would change
 *   what the parent does.
 */
function isFormSensitiveOperand(node: Node, context: NodeSlot): boolean {
  let { parent, key } = context
  let inner = unwrapExpression(node)
  switch (parent?.type) {
    case 'TaggedTemplateExpression':
      return key === 'quasi' || isThisCallee(inner)
    case 'UnaryExpression':
      return (
        parent.operator === 'delete' ||
        (parent.operator === 'typeof' && inner.type === 'Identifier')
      )
    case 'CallExpression':
      return key === 'callee' && isThisCallee(inner)
    default:
      return false
  }
}

/**
 * Tells whether a node is a name rather than a value: a binding name, a
 * non-computed key or member property, a label or a part of a meta property.
 *
 * @param slot - Slot of the node through parentheses.
 * @param context - Context slot of the node.
 * @returns Whether the node names something.
 */
function isNameSlot(slot: NodeSlot, context: NodeSlot): boolean {
  if (bindingKeys.has(context.key!)) {
    return true
  }
  let { parent, key } = slot
  switch (parent?.type) {
    case 'PropertyDefinition':
    case 'MethodDefinition':
    case 'AccessorProperty':
    case 'MemberExpression':
    case 'Property':
      return (key === 'key' || key === 'property') && !parent.computed
    case 'MetaProperty':
      return true
    default:
      return key === 'label'
  }
}

/**
 * Tells whether a node is assigned to: the target of an assignment, of a loop
 * head or of an update, or a part of a destructuring pattern.
 *
 * @param tree - Runtime tree of the file.
 * @param context - Context slot of an expression, which always has a parent.
 * @returns Whether a conditional expression in place of the node would not be
 *   assignable.
 */
function isWriteTarget(tree: TreeIndex, context: NodeSlot): boolean {
  let { key } = context
  let parent = context.parent!
  if (key === 'left' && assignedLeftTypes.has(parent.type)) {
    return true
  }
  if (assignedOperandTypes.has(parent.type)) {
    return true
  }
  return (
    parent.type === 'Property' &&
    key === 'value' &&
    tree.slots.get(parent)!.parent!.type === 'ObjectPattern'
  )
}

/**
 * Tells whether a callee passes `this` to the function it calls or is a direct
 * `eval`.
 *
 * @param node - Callee without wrappers.
 * @returns Whether the callee is a member, an optional chain or `eval`.
 */
function isThisCallee(node: Node): boolean {
  switch (node.type) {
    case 'MemberExpression':
    case 'ChainExpression':
      return true
    case 'Identifier':
      return node.name === 'eval'
    default:
      return false
  }
}
