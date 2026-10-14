import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

import { createRunContext } from './shared/create-run-context'
import { hasGroupConstant } from './shared/has-group-constant'
import { getLogicalDrops } from './shared/get-logical-drops'
import { getNullishPlan } from './shared/get-nullish-plan'

/**
 * Options of the logical-operator mutator.
 */
interface LogicalOperatorOptions {
  /**
   * When `??` and `||` are swapped: `distinguishing` only where a falsy value
   * that is not nullish gives a different result, `always` also for a number
   * with the default `0` and for an unknown left side.
   */
  nullishSwap: 'distinguishing' | 'always'

  /**
   * Whether a `null`, `undefined` or `void 0` default of `??` is dropped.
   */
  nullishNormalization: boolean
}

/**
 * Drops one operand of `&&`, `||` or `??`, swaps `??` and `||` where falsy
 * values differ, or makes a whole condition constant.
 */
export let logicalOperator: Mutator<LogicalOperatorOptions> = {
  create(context) {
    let { sourceCode, options } = context
    let runContext = createRunContext(context)
    return {
      /**
       * Emits the mutants of a logical expression (catalog 4.8). For `&&` and
       * `||`: the drop of the left operand, the drop of the right operand or
       * the nullish swap in its place, and the absorbing constant of the group.
       * For `??`: the drop of the left side, the drop of the default, and the
       * swap to `||`.
       *
       * @param node - Logical expression of the runtime tree.
       * @returns Replacements of the expression, in emission order.
       */
      LogicalExpression(node) {
        let left = sourceCode.getText(node.left)
        let right = sourceCode.getText(node.right)
        let replacements: Replacement[] = []
        if (node.operator === '??') {
          let plan = getNullishPlan(node, context, options)
          if (plan.dropLeft) {
            replacements.push({ text: right, node })
          }
          if (plan.dropRight) {
            replacements.push({ text: left, node })
          }
          if (plan.swap) {
            replacements.push({
              text: sourceCode.replaceOperator(node, '||'),
              node,
            })
          }
          return replacements
        }
        let drops = getLogicalDrops(node, runContext, options.nullishSwap)
        if (drops.dropLeft) {
          replacements.push({ text: right, node })
        }
        if (drops.swap) {
          replacements.push({
            text: sourceCode.replaceOperator(node, '??'),
            node,
          })
        } else if (drops.dropRight) {
          replacements.push({ text: left, node })
        }
        if (hasGroupConstant(node, runContext)) {
          replacements.push({ text: String(node.operator === '||'), node })
        }
        return replacements
      },
    }
  },
  meta: {
    description:
      'Drops one operand of &&, || or ??, swaps ?? and || where falsy values differ, or makes a whole condition constant.',
    defaultOptions: {
      nullishSwap: 'distinguishing',
      nullishNormalization: false,
    },
  },
}
