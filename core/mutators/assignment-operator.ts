import type { AssignmentExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { LiteralValue } from './shared/get-literal-value'
import type { InferredType } from '../../types/inferred-type'
import type { SourceCode } from '../../types/source-code'
import type { Mutator } from '../../types/mutator'

import { distinguishesNullishSwap } from './shared/distinguishes-nullish-swap'
import { isCanonicalFalsy } from './shared/is-canonical-falsy'
import { isAlwaysNullish } from './shared/is-always-nullish'
import { getLiteralValue } from './shared/get-literal-value'
import { isAlwaysTruthy } from './shared/is-always-truthy'
import { isNumericPair } from './shared/is-numeric-pair'
import { isNumberType } from './shared/is-number-type'
import { mayBeNullish } from './shared/may-be-nullish'
import { getTypeView } from './shared/get-type-view'

/**
 * Options of the assignment-operator mutator.
 */
interface AssignmentOperatorOptions {
  /**
   * When `??=` and `||=` are swapped: `distinguishing` only where a falsy value
   * that is not nullish gives a different result, `always` also for a number
   * with the default `0` and for an unknown left side.
   */
  nullishSwap: 'distinguishing' | 'always'
}

/**
 * Operator written in place of each arithmetic or bitwise compound assignment
 * operator.
 */
let swaps = new Map<string, string>([
  ['>>>=', '>>='],
  ['<<=', '>>='],
  ['>>=', '<<='],
  ['**=', '*='],
  ['+=', '-='],
  ['-=', '+='],
  ['*=', '/='],
  ['/=', '*='],
  ['%=', '*='],
  ['&=', '|='],
  ['|=', '&='],
  ['^=', '|='],
])

/**
 * Right operand literals that make the swap of each operator change nothing.
 */
let identities = new Map<string, Set<LiteralValue>>([
  ['*=', new Set([-1n, -1, 1n, 1])],
  ['/=', new Set([-1n, -1, 1n, 1])],
  ['<<=', new Set([0n, 0])],
  ['>>=', new Set([0n, 0])],
  ['**=', new Set([1n, 1])],
  ['+=', new Set([0n, 0])],
  ['-=', new Set([0n, 0])],
  ['^=', new Set([0n, 0])],
])

/**
 * Swaps a compound assignment operator, or makes a logical assignment
 * unconditional, never happen, or swapped between `??` and `||` (catalog 4.3,
 * 11.7). Arithmetic and bitwise operators swap (`+=` only between numbers),
 * except for identities (EQ). Each logical assignment gets the guard ignored
 * (`=`), the nullish swap where it distinguishes values, and the assignment
 * that never happens (the target alone); the swap replaces the variant it
 * subsumes, and variants that types make equivalent are skipped (EQ). An
 * assignment that advances a loop gets no mutant unless the `timeouts` setting
 * is on (TIMEOUT, catalog 2.2 b).
 */
export let assignmentOperator: Mutator<AssignmentOperatorOptions> = {
  create(context) {
    let { sourceCode, settings, syntax, hints } = context
    return {
      AssignmentExpression(node) {
        if (
          node.operator === '=' ||
          (!settings.timeouts && syntax.advancesLoop(node))
        ) {
          return []
        }
        let { operator, right, left } = node
        let leftType = hints.getType(left)
        let swap = swaps.get(operator)
        if (swap !== undefined) {
          let value = getLiteralValue(right)
          let identity =
            value !== null &&
            identities.get(operator)?.has(value) &&
            (operator !== '-=' || isNumberType(leftType))
          let numeric =
            operator !== '+=' || isNumericPair(leftType, hints.getType(right))
          return identity || !numeric ?
              []
            : [{ text: sourceCode.replaceOperator(node, swap), node }]
        }
        return getLogicalVariants(node, context).map(variant => ({
          text:
            variant === null ?
              getTargetText(node, sourceCode)
            : sourceCode.replaceOperator(node, variant),
          node,
        }))
      },
    }
  },
  meta: {
    description:
      'Swaps a compound assignment operator, or makes a logical assignment unconditional, never happen, or swapped between ?? and ||.',
    defaultOptions: { nullishSwap: 'distinguishing' },
  },
}

/**
 * Lists the mutants of a logical assignment in emission order (catalog 4.3):
 * the guard ignored (`=`), the `??`/`||` swap, and the assignment that never
 * happens (null, the target alone), each skipped where the target's type makes
 * it equivalent; a swap that is emitted replaces the variant it subsumes
 * (catalog 5.4 S1).
 *
 * @param node - Assignment with `&&=`, `||=` or `??=`.
 * @param context - Mutator context of the file.
 * @returns New operators, with null for the assignment that never happens.
 */
function getLogicalVariants(
  node: AssignmentExpression,
  context: MutatorContext<AssignmentOperatorOptions>,
): (string | null)[] {
  let { right, left } = node
  let leftType = context.hints.getType(left)
  let nullable = mayBeNullish(leftType)
  let distinguishes = distinguishesNullishSwap(
    { right, left },
    context.hints,
    context.options.nullishSwap,
  )
  let variants: (string | null)[] = []
  switch (node.operator) {
    case '&&=':
      if (!isGuardInvisible(leftType, right)) {
        variants.push('=')
      }
      if (!isAlwaysNullish(leftType)) {
        variants.push(null)
      }
      break
    case '||=':
      if (!isAlwaysNullish(leftType)) {
        variants.push('=')
      }
      if (nullable && distinguishes) {
        variants.push('??=')
      } else if (!isGuardInvisible(leftType, right)) {
        variants.push(null)
      }
      break
    default:
      if (distinguishes) {
        variants.push('||=')
      } else if (!isAlwaysNullish(leftType)) {
        variants.push('=')
      }
      if (nullable) {
        variants.push(null)
      }
  }
  return variants
}

/**
 * Builds the target text of an assignment (catalog 2.3 T9): the source from the
 * start of the assignment to the end of the target, followed by one `)` for
 * every `)` between the target and the operator, which oxc does not represent
 * (`(a) ||= b` gives `(a)`). Comments in that gap are left out.
 *
 * @param node - Assignment expression.
 * @param sourceCode - Source code of the file.
 * @returns Text of the target with its parentheses.
 */
function getTargetText(
  node: AssignmentExpression,
  sourceCode: SourceCode,
): string {
  let { comments, text } = sourceCode
  let operatorStart = sourceCode.getOperatorRange(node).start
  let closing = ''
  for (let offset = node.left.end; offset < operatorStart; offset++) {
    let comment = comments.find(({ start }) => start === offset)
    if (comment) {
      offset = comment.end - 1
    } else if (text[offset] === ')') {
      closing += ')'
    }
  }
  return text.slice(node.start, node.left.end) + closing
}

/**
 * Tells whether the truth of the target cannot change the result of a `&&=` or
 * `||=` (catalog 4.3, EQ): the target is always truthy, or it is never nullish
 * and the assigned value is the only falsy value of its type. Then `a &&= b`
 * equals `a = b`, and `a ||= b` equals `a`.
 *
 * @param target - Type of the assignment target.
 * @param right - Assigned value.
 * @returns Whether the variant that ignores the guard is equivalent.
 */
function isGuardInvisible(target: InferredType, right: Node): boolean {
  return (
    isAlwaysTruthy(target) ||
    (!mayBeNullish(target) && isCanonicalFalsy(getTypeView(target).type, right))
  )
}
