import type { Node } from 'oxc-parser'

import type { RunContext } from './create-run-context'

import { getNextLiteralValue } from './get-next-literal-value'
import { getLiteralValue } from './get-literal-value'
import { getLiteralSkip } from './get-literal-skip'

/**
 * Finds the truth value that the literal mutator of a literal gives it, when it
 * emits a mutant that changes the literal's truth value (catalog 2.8): a
 * boolean flip, `0` to `1` and `-1` to `0` (also for BigInts), and a string or
 * a template without expressions emptied or filled. The skips that all literal
 * mutators share apply here too: operands of comparisons, of boolean-mode `&&`
 * and `||` and of `void`, error messages for strings, timeout-only flips of
 * boolean and number literals, branches made equal to the other branch, no-op
 * callbacks and emptied `||` defaults. The literal mutators report those skips
 * themselves.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The new truth value, or null when no such mutant is emitted.
 */
export function getLiteralFlip(
  node: Node,
  context: RunContext,
): boolean | null {
  let value = getLiteralValue(node)
  let { parent } = context.sourceCode.getSlot(node)
  if (
    value === null ||
    (parent?.type === 'UnaryExpression' &&
      parent.operator === '-' &&
      parent.argument === node)
  ) {
    return null
  }
  let next = getNextLiteralValue(value)
  let truth = Boolean(next)
  if (
    truth === Boolean(value) ||
    getLiteralSkip(node, { change: { value: next } }, context) !== null
  ) {
    return null
  }
  return truth
}
