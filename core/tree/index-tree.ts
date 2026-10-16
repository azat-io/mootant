import type { Program, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { isLoggerFactoryCall } from '../syntax/is-logger-factory-call'
import { isLoggingCall } from '../syntax/is-logging-call'
import { isLoggerLabel } from '../syntax/is-logger-label'
import { isModuleCall } from '../syntax/is-module-call'
import { isNamePosition } from './is-name-position'
import { walkTree } from './walk-tree'

/**
 * Child keys that hold only TypeScript types or decorators.
 */
let skippedKeys = new Set<string | null>([
  'superTypeArguments',
  'typeParameters',
  'typeAnnotation',
  'typeArguments',
  'returnType',
  'decorators',
  'implements',
])

/**
 * Node types whose subtree holds no runtime code that can be mutated: module
 * metadata, type-only declarations, bodiless functions, abstract members, enums
 * and decorators.
 */
let skippedTypes = new Set<string>([
  'TSEmptyBodyFunctionExpression',
  'TSAbstractPropertyDefinition',
  'TSNamespaceExportDeclaration',
  'TSAbstractAccessorProperty',
  'TSAbstractMethodDefinition',
  'TSImportEqualsDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'ExportAllDeclaration',
  'ImportDeclaration',
  'TSDeclareFunction',
  'TSEnumDeclaration',
  'TSIndexSignature',
  'Decorator',
])

/**
 * Builds the runtime tree of a program in one walk: the raw slot of every node
 * that holds runtime code, and the nodes that visitors receive in pre-order.
 * Type positions, type-only and ambient declarations, module specifiers,
 * directives, the callee and arguments of logging calls, the label of a
 * child-logger factory such as `logger.withContext('Build')` and the arguments
 * of `import.meta.glob` are left out. Names that are never values, such as
 * non-computed keys, are indexed but not dispatched.
 *
 * @param program - Root of the file.
 * @param loggers - Exact receiver names the `loggers` setting adds to the
 *   loggers of logging calls and child-logger factories; none when omitted.
 * @returns Slots and dispatch order of the runtime tree.
 */
export function indexTree(
  program: Program,
  loggers: readonly string[] = [],
): TreeIndex {
  let slots = new Map<Node, NodeSlot>()
  let order: Node[] = []
  walkTree(program, (node, slot) => {
    if (isSkippedNode(node) || isSkippedSlot(slot, loggers)) {
      return false
    }
    slots.set(node, slot)
    if (!isNamePosition(slot)) {
      order.push(node)
    }
    return true
  })
  return { slots, order }
}

/**
 * Tells whether a slot holds module metadata, a type, a namespace name or the
 * part of a call that only a log or a module specifier depends on.
 *
 * @param slot - Raw slot of a node.
 * @param loggers - Exact receiver names the `loggers` setting adds.
 * @returns Whether the node in the slot is left out of the runtime tree.
 */
function isSkippedSlot(slot: NodeSlot, loggers: readonly string[]): boolean {
  let { parent, index, key } = slot
  if (skippedKeys.has(key)) {
    return true
  }
  switch (parent?.type) {
    case 'ExportNamedDeclaration':
      return key !== 'declaration'
    case 'TSModuleDeclaration':
      return key === 'id'
    case 'ImportExpression':
      /**
       * Both children, `source` and `options`, are a module specifier and
       * import attributes.
       */
      return true
    case 'CallExpression':
      return (
        isLoggingCall(parent, loggers) ||
        (index === 0 &&
          isLoggerFactoryCall(parent, loggers) &&
          isLoggerLabel(parent.arguments[0]!)) ||
        (index !== null && isModuleCall(parent, index))
      )
    default:
      return false
  }
}

/**
 * Tells whether a node is left out of the runtime tree because of its own type
 * or flags: type-only and ambient declarations, directives and method
 * overloads.
 *
 * @param node - Node found by the walk.
 * @returns Whether the node and its subtree are left out.
 */
function isSkippedNode(node: Node): boolean {
  if (skippedTypes.has(node.type) || Reflect.get(node, 'declare') === true) {
    return true
  }
  switch (node.type) {
    case 'ExpressionStatement':
      return typeof node.directive === 'string'
    case 'MethodDefinition':
      return node.value.type === 'TSEmptyBodyFunctionExpression'
    default:
      return false
  }
}
