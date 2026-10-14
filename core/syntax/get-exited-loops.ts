import type {
  DoWhileStatement,
  WhileStatement,
  ForStatement,
  IfStatement,
  Node,
} from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getSlot } from '../tree/get-slot'
import { isFunction } from './is-function'

/**
 * Loop that decides with a test whether to run its body again.
 */
type TestedLoop = DoWhileStatement | WhileStatement | ForStatement

/**
 * Statements that an unlabeled `break` leaves.
 */
let breakableTypes = new Set([
  'DoWhileStatement',
  'SwitchStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'ForStatement',
])

/**
 * Finds the loops that an `if` statement leaves: the consequent is, or is a
 * block that ends with, a `break`, a labeled `continue` or a `return`, and the
 * loops are those that run forever among the loops the jump leaves. A loop runs
 * forever when it is a `for` without a test, or its test is a truthy literal. A
 * `return` leaves every loop up to the function, an unlabeled `break` the
 * nearest loop or `switch` (a `break` that leaves a `switch` leaves no loop), a
 * labeled `break` every loop up to and including the statement with that label,
 * and a labeled `continue` every loop inside the statement with that label. The
 * test of such an `if` is an exit test of each of the loops.
 *
 * @param tree - Runtime tree of the file.
 * @param node - If statement of the runtime tree.
 * @returns The loops that run forever and that the statement leaves, innermost
 *   first.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getExitedLoops(
  tree: TreeIndex,
  node: IfStatement,
): TestedLoop[] {
  let slot = getSlot(tree, node)
  let { consequent } = node
  let exit =
    consequent.type === 'BlockStatement' ? consequent.body.at(-1) : consequent
  if (
    exit?.type !== 'BreakStatement' &&
    exit?.type !== 'ReturnStatement' &&
    (exit?.type !== 'ContinueStatement' || !exit.label)
  ) {
    return []
  }

  let loops: TestedLoop[] = []
  while (slot.parent && !isFunction(slot.parent)) {
    let { parent } = slot
    if (exit.type !== 'ReturnStatement') {
      if (!exit.label && breakableTypes.has(parent.type)) {
        return isEndlessLoop(parent) ? [parent] : []
      }
      if (
        parent.type === 'LabeledStatement' &&
        parent.label.name === exit.label?.name
      ) {
        return exit.type === 'ContinueStatement' ?
            loops.filter(loop => loop !== parent.body)
          : loops
      }
    }
    if (isEndlessLoop(parent)) {
      loops.push(parent)
    }
    slot = tree.slots.get(parent)!
  }
  return loops
}

/**
 * Tells whether a node is a loop that runs forever unless its body leaves it: a
 * `for` without a test, or a `while`, `do...while` or `for` whose test is a
 * truthy literal.
 *
 * @param node - Node to check.
 * @returns Whether the node is a loop whose test never stops it.
 */
function isEndlessLoop(node: Node): node is TestedLoop {
  switch (node.type) {
    case 'DoWhileStatement':
    case 'WhileStatement':
      return isTruthyLiteral(node.test)
    case 'ForStatement':
      return node.test === null || isTruthyLiteral(node.test)
    default:
      return false
  }
}

/**
 * Tells whether a test is, through wrappers, a literal whose value is truthy.
 *
 * @param node - Test of a loop.
 * @returns Whether the test is always true.
 */
function isTruthyLiteral(node: Node): boolean {
  let value = unwrapExpression(node)
  return value.type === 'Literal' && Boolean(value.value)
}
