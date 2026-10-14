import type {
  DoWhileStatement,
  WhileStatement,
  ForStatement,
  Node,
} from 'oxc-parser'

/**
 * Loops that decide with a test whether to run their body again.
 */
let testedLoopTypes = new Set([
  'DoWhileStatement',
  'WhileStatement',
  'ForStatement',
])

/**
 * Tells whether a node is a loop that decides with a test whether to run its
 * body again.
 *
 * @param node - Node to check, or null.
 * @returns Whether the node is a `while`, `do...while` or `for` loop.
 */
export function isTestedLoop(
  node: Node | null,
): node is DoWhileStatement | WhileStatement | ForStatement {
  return node !== null && testedLoopTypes.has(node.type)
}
