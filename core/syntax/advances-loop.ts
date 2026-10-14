import type {
  DoWhileStatement,
  WhileStatement,
  ForStatement,
  Node,
} from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { unwrapExpression } from '../tree/unwrap-expression'
import { isNamePosition } from '../tree/is-name-position'
import { getExitedLoops } from './get-exited-loops'
import { isTestedLoop } from './is-tested-loop'
import { getRootName } from './get-root-name'
import { walkTree } from '../tree/walk-tree'
import { isStatement } from './is-statement'
import { getSlot } from '../tree/get-slot'
import { isFunction } from './is-function'

/**
 * Loop that decides with a test whether to run its body again.
 */
type TestedLoop = DoWhileStatement | WhileStatement | ForStatement

/**
 * Keys of a loop under which a change can make the loop stop.
 */
let loopPartKeys = new Set(['update', 'body', 'test'])

/**
 * Names that each loop reads to decide whether to go on, computed once per loop
 * node.
 */
let loopRoots = new WeakMap<Node, ReadonlySet<string | null>>()

/**
 * Tells whether an update, assignment or statement changes a name that a loop
 * around it reads to decide whether to go on. A loop reads the names of the
 * identifiers in its test or, when it runs forever, in its exit tests, plus
 * `this`. The node must lie in the test, the body or the update of the loop,
 * without a function boundary in between. An update or an assignment changes
 * the root name of its target (`items` for `items[0]`), and an assignment to a
 * destructuring pattern that of every target it binds; a statement changes a
 * name when it holds, outside nested functions, such an update or assignment,
 * or a method call on the name (`queue.shift()`).
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether a mutant that stops the change can make a loop run forever.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function advancesLoop(tree: TreeIndex, node: Node): boolean {
  let roots = new Set<string | null>()
  for (let loop of getEnclosingLoops(tree, node)) {
    for (let name of getLoopRoots(tree, loop)) {
      roots.add(name)
    }
  }
  if (roots.size === 0) {
    return false
  }
  if (changesRoot(node, roots)) {
    return true
  }
  if (!isStatement(node)) {
    return false
  }

  let changes = false
  walkTree(node, child => {
    if (isFunction(child)) {
      return false
    }
    changes ||= changesRoot(child, roots) || callsRootMethod(child, roots)
    return true
  })
  return changes
}

/**
 * Collects the root names of the targets an assignment changes. A plain target
 * changes its root name; a destructuring pattern changes every target it binds,
 * through defaults, rest elements and nested patterns.
 *
 * @param node - Target of an assignment.
 * @returns The root names of the changed targets, null for a target without
 *   one.
 */
function getTargetRoots(node: Node): (string | null)[] {
  let target = node
  while (target.type === 'AssignmentPattern' || target.type === 'RestElement') {
    target = target.type === 'AssignmentPattern' ? target.left : target.argument
  }
  switch (target.type) {
    case 'ObjectPattern':
      return target.properties.flatMap(property =>
        getTargetRoots(
          property.type === 'RestElement' ? property : property.value,
        ),
      )
    case 'ArrayPattern':
      return target.elements.flatMap(element =>
        element ? getTargetRoots(element) : [],
      )
    default:
      return [getRootName(target)]
  }
}

/**
 * Collects the names a loop reads to decide whether to go on: the identifiers
 * of its test and of its exit tests, plus `this` when one of them uses it. A
 * loop that does not run forever has no exit tests, so for it only the test
 * counts.
 *
 * @param tree - Runtime tree of the file.
 * @param loop - Loop of the runtime tree.
 * @returns The names the loop reads.
 */
function getLoopRoots(
  tree: TreeIndex,
  loop: TestedLoop,
): ReadonlySet<string | null> {
  let cached = loopRoots.get(loop)
  if (cached) {
    return cached
  }

  let roots = new Set<string | null>()
  if (loop.test) {
    addReadNames(tree, loop.test, roots)
  }
  walkTree(loop.body, child => {
    if (!tree.slots.has(child) || isFunction(child)) {
      return false
    }
    if (
      child.type === 'IfStatement' &&
      getExitedLoops(tree, child).includes(loop)
    ) {
      addReadNames(tree, child.test, roots)
    }
    return true
  })
  loopRoots.set(loop, roots)
  return roots
}

/**
 * Adds the names of the identifiers an expression reads, and `this`, to a set.
 * Nested functions and type positions are skipped.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Expression of the runtime tree.
 * @param names - Set that receives the names.
 */
function addReadNames(
  tree: TreeIndex,
  node: Node,
  names: Set<string | null>,
): void {
  walkTree(node, (child, slot) => {
    if (!tree.slots.has(child) || isFunction(child)) {
      return false
    }
    if (child.type === 'ThisExpression') {
      names.add('this')
    } else if (child.type === 'Identifier' && !isNamePosition(slot)) {
      names.add(child.name)
    }
    return true
  })
}

/**
 * Finds the loops whose test, body or update holds a node, without a function
 * boundary in between.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns The loops around the node, innermost first.
 */
function getEnclosingLoops(tree: TreeIndex, node: Node): TestedLoop[] {
  let loops: TestedLoop[] = []
  let slot = getSlot(tree, node)
  while (slot.parent && !isFunction(slot.parent)) {
    let { parent, key } = slot
    if (isTestedLoop(parent) && loopPartKeys.has(key!)) {
      loops.push(parent)
    }
    slot = tree.slots.get(parent)!
  }
  return loops
}

/**
 * Tells whether a node is an update or an assignment whose target has one of
 * the root names.
 *
 * @param node - Node to check.
 * @param roots - Names a loop reads.
 * @returns Whether the node changes a name the loop reads.
 */
function changesRoot(node: Node, roots: ReadonlySet<string | null>): boolean {
  switch (node.type) {
    case 'AssignmentExpression':
      return getTargetRoots(node.left).some(name => roots.has(name))
    case 'UpdateExpression':
      return roots.has(getRootName(node.argument))
    default:
      return false
  }
}

/**
 * Tells whether a node is a call of a method on one of the root names.
 *
 * @param node - Node to check.
 * @param roots - Names a loop reads.
 * @returns Whether the node calls a method of a name the loop reads.
 */
function callsRootMethod(
  node: Node,
  roots: ReadonlySet<string | null>,
): boolean {
  if (node.type !== 'CallExpression') {
    return false
  }
  let callee = unwrapExpression(node.callee)
  return (
    callee.type === 'MemberExpression' && roots.has(getRootName(callee.object))
  )
}
