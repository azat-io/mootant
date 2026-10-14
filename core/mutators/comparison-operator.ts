import type { Mutator } from '../../types/mutator'

import { getComparisonPlan } from './shared/get-comparison-plan'
import { isComparison } from './shared/is-comparison'

/**
 * Moves a comparison's boundary or literal, flips its direction, or makes it
 * constant: the minimal set that subsumes all other comparison mutants.
 */
export let comparisonOperator: Mutator = {
  create(context) {
    return {
      /**
       * Emits the plan of a comparison (catalog 4.6): the operator swaps, the
       * shifted literal or the constants, minus the entries that the context
       * rules skip.
       *
       * @param node - Binary expression of the runtime tree.
       * @returns Replacements of the comparison, in the plan's order.
       */
      BinaryExpression(node) {
        if (!isComparison(node)) {
          return []
        }
        return getComparisonPlan(node, context).map(entry => ({
          text: entry.text,
          node,
        }))
      },
    }
  },
  meta: {
    description:
      "Moves a comparison's boundary or literal, flips its direction, or makes it constant: the minimal set that subsumes all other comparison mutants.",
  },
}
