import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

/**
 * Swaps ++ and --, or prefix and postfix when the value is used (catalog 4.18).
 * The `++`/`--` swap keeps the prefix or postfix form; it is a TIMEOUT mutant
 * when the update advances a loop (catalog 2.2 a), emitted only with the
 * `timeouts` setting. When the value of the update is used, the prefix/postfix
 * swap with the same operator follows (`arr[j++]` to `arr[++j]`); it still
 * advances a loop, so it is always kept.
 */
export let updateOperator: Mutator = {
  create(context) {
    let { sourceCode, settings, syntax } = context
    let { text } = sourceCode
    return {
      UpdateExpression(node) {
        let { operator, prefix } = node
        let replacements: Replacement[] = []
        if (settings.timeouts || !syntax.advancesLoop(node)) {
          replacements.push({
            text: sourceCode.replaceOperator(
              node,
              operator === '++' ? '--' : '++',
            ),
            node,
          })
        }
        if (!syntax.isResultUnused(node)) {
          replacements.push({
            text:
              prefix ?
                text.slice(node.start + 2, node.end).trimStart() + operator
              : operator + text.slice(node.start, node.end - 2).trimEnd(),
            node,
          })
        }
        return replacements
      },
    }
  },
  meta: {
    description:
      'Swaps ++ and --, or prefix and postfix when the value is used.',
  },
}
