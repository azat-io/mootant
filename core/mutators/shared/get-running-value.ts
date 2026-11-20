import type {
  DoWhileStatement,
  WhileStatement,
  ForStatement,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { isTestedLoop } from '../../syntax/is-tested-loop'
import { isBooleanMode } from './is-boolean-mode'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Value of a node that keeps a loop running, with that loop.
 */
export interface RunningValue {
  /**
   * Loop whose continuation the node decides; for an exit test that leaves
   * several loops that run forever, the innermost one, whose body runs between
   * two checks of the test unless something else leaves it. Whether the value
   * keeps each of these loops running forever is left to `getEndlessValue`.
   */
  loop: DoWhileStatement | WhileStatement | ForStatement

  /**
   * Value that keeps the loop running.
   */
  value: boolean
}

/**
 * Finds the value of a node that keeps a loop running (catalog 2.2, `RV`):
 * `true` in a loop test, `false` in an exit test of a loop that runs forever,
 * the opposite of the parent's under `!`, and the parent's in an operand of a
 * `&&` or `||` in boolean mode. A node has one exactly when it is in a loop
 * condition (`LT`). A mutant that makes the node equal its running value
 * everywhere keeps the loop running unless something else ends it, such as
 * another exit of the loop (see `getEndlessValue`).
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The running value and its loop, or null.
 */
export function getRunningValue(
  node: Node,
  context: MutatorContext,
): RunningValue | null {
  let current = node
  let inverted = false
  for (;;) {
    let { parent, key } = context.syntax.getContextSlot(current)
    if (key === 'test' && isTestedLoop(parent)) {
      return { value: !inverted, loop: parent }
    }
    if (key === 'test' && parent?.type === 'IfStatement') {
      let [loop] = context.syntax.getExitedLoops(parent)
      return loop ? { value: inverted, loop } : null
    }
    if (isNegation(parent)) {
      inverted = !inverted
    } else if (!isAndOr(parent) || !isBooleanMode(parent, context)) {
      return null
    }
    current = parent
  }
}
