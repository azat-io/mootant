import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

/**
 * Swaps ++ and --, or prefix and postfix when the value is used (catalog 4.18).
 * The `++`/`--` swap keeps the prefix or postfix form; it is a TIMEOUT mutant
 * when the update advances a loop (catalog 2.2 a), emitted only with the
 * `timeouts` setting. When the value of the update is used, the prefix/postfix
 * swap with the same operator follows (`arr[j++]` to `arr[++j]`); it still
 * advances a loop, so it is always kept. Where the value is unused, that swap
 * changes nothing (EQ) and follows as a skipped replacement, like the timeout
 * `++`/`--` swap.
 */
export let updateOperator: Mutator = {
  create(context) {
    let { sourceCode, settings, syntax } = context
    let { text } = sourceCode
    return {
      UpdateExpression(node) {
        let { operator, prefix } = node
        let swap: Replacement = {
          text: sourceCode.replaceOperator(
            node,
            operator === '++' ? '--' : '++',
          ),
          node,
        }
        if (!settings.timeouts && syntax.advancesLoop(node)) {
          swap.skip = {
            reason:
              'it changes the update that advances a loop, so only a timeout could kill it',
            rule: 'loop-advance',
          }
        }
        let position: Replacement = {
          text:
            prefix ?
              text.slice(node.start + 2, node.end).trimStart() + operator
            : operator + text.slice(node.start, node.end - 2).trimEnd(),
          node,
        }
        if (syntax.isResultUnused(node)) {
          position.skip = {
            reason:
              'the value of the update is unused, so prefix and postfix do the same',
            rule: 'unused-result',
          }
        }
        return [swap, position]
      },
    }
  },
  meta: {
    description:
      'Swaps ++ and --, or prefix and postfix when the value is used.',
  },
}
