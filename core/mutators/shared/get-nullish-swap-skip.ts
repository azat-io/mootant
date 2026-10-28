import type { LogicalExpression } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { SkipNote } from '../../../types/mutant/skip-note'

import { distinguishesNullishSwap } from './distinguishes-nullish-swap'

/**
 * Finds why the swap between `??` and `||` of a logical expression is not
 * emitted (catalog 4.8): under every `nullishSwap` mode it is equivalent when
 * the left side is never falsy unless nullish (see `getNeverFalsyFact`), and
 * otherwise it is emitted only where `distinguishesNullishSwap` finds a falsy
 * value that gives a different result.
 *
 * @param node - `??` or `||` expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @param nullishSwap - The `nullishSwap` option of logical-operator.
 * @returns Rule and reason of the skip, or null when the swap is emitted.
 */
export function getNullishSwapSkip(
  node: LogicalExpression,
  context: MutatorContext,
  nullishSwap: 'distinguishing' | 'always',
): SkipNote | null {
  let neverFalsy = context.syntax.getNeverFalsyFact(node.left)
  if (neverFalsy !== null) {
    return {
      reason: `the left side is never falsy when defined (${neverFalsy}), so || and ?? agree`,
      rule: 'never-falsy',
    }
  }
  if (distinguishesNullishSwap(node, context.hints, nullishSwap)) {
    return null
  }
  return {
    reason:
      '?? and || differ here only on falsy values that the nullishSwap option does not count, such as the default itself',
    rule: 'nullish-swap',
  }
}
