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
       * rules skip, which follow as skipped replacements.
       *
       * @param node - Binary expression of the runtime tree.
       * @returns Replacements of the comparison, in the plan's order, then the
       *   skipped ones.
       */
      BinaryExpression(node) {
        if (!isComparison(node)) {
          return []
        }
        let plan = getComparisonPlan(node, context)
        return [
          ...plan.entries.map(entry => ({ text: entry.text, node })),
          ...plan.skipped,
        ]
      },
    }
  },
  meta: {
    description:
      "Moves a comparison's boundary or literal, flips its direction, or makes it constant: the minimal set that subsumes all other comparison mutants.",
  },
}
