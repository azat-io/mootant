import type {
  DoWhileStatement,
  WhileStatement,
  ForStatement,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { getNegationTop } from './get-negation-top'

/**
 * Finds the value of a node that makes a first exit test leave its loop at the
 * first check (catalog 2.2, first exit test; O13). A first exit test is the
 * test, through `!`, of an `if` that is the first statement of the body of a
 * `for` without a test or of a `while` or `for` whose test is the literal
 * `true`, and whose consequent is a lone `break` that leaves that loop and no
 * loop around it. Forcing it to leave at once is the loop's never-run mutant,
 * which owns that behavior.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The value that leaves the loop at once, or null when the node is not
 *   a first exit test.
 */
export function getLeaveNowValue(
  node: Node,
  context: MutatorContext,
): boolean | null {
  let top = getNegationTop(node, context)
  let { parent, key } = context.syntax.getContextSlot(top.node)
  if (key !== 'test' || parent?.type !== 'IfStatement') {
    return null
  }
  let { consequent } = parent
  let exit =
    consequent.type === 'BlockStatement' && consequent.body.length === 1 ?
      consequent.body[0]!
    : consequent
  if (exit.type !== 'BreakStatement') {
    return null
  }
  let loop = context.syntax.getExitedLoops(parent).at(-1)
  if (!loop || !hasNeverRunMutant(loop)) {
    return null
  }
  if (exit.label) {
    let target = context.syntax.getContextSlot(loop).parent
    if (
      target?.type !== 'LabeledStatement' ||
      target.label.name !== exit.label.name
    ) {
      return null
    }
  }
  let first =
    loop.body.type === 'BlockStatement' ? loop.body.body[0] : loop.body
  return first === parent ? top.negations % 2 === 0 : null
}

/**
 * Tells whether a loop has a mutant that never runs its body: condition's `for
 * (;false;)` for a `for` without a test, boolean-literal's flip of a `while` or
 * `for` test that is the literal `true`.
 *
 * @param loop - Loop that runs forever.
 * @returns Whether the never-run mutant exists.
 */
function hasNeverRunMutant(
  loop: DoWhileStatement | WhileStatement | ForStatement,
): boolean {
  if (loop.type === 'DoWhileStatement') {
    return false
  }
  if (!loop.test) {
    return true
  }
  let test = unwrapExpression(loop.test)
  return test.type === 'Literal' && test.value === true
}
