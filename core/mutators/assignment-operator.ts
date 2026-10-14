import type { AssignmentExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { LiteralValue } from './shared/get-literal-value'
import type { InferredType } from '../../types/inferred-type'
import type { Replacement } from '../../types/replacement'
import type { SourceCode } from '../../types/source-code'
import type { SkipNote } from '../../types/skip-note'
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
 * Mutant of a logical assignment and whether it is skipped.
 */
interface LogicalVariant {
  /**
   * New operator, or null for the assignment that never happens.
   */
  operator: string | null

  /**
   * Why the variant is not emitted, or null when it is.
   */
  skip: SkipNote | null
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
 * is on (TIMEOUT, catalog 2.2 b). Skipped mutants follow as skipped
 * replacements.
 */
export let assignmentOperator: Mutator<AssignmentOperatorOptions> = {
  create(context) {
    let { settings, syntax } = context
    return {
      AssignmentExpression(node) {
        if (node.operator === '=') {
          return []
        }
        let replacements = getReplacements(node, context)
        if (settings.timeouts || !syntax.advancesLoop(node)) {
          return replacements
        }
        return replacements.map(replacement => ({
          skip: replacement.skip ?? {
            reason:
              'it changes the assignment that advances a loop, so only a timeout could kill it',
            rule: 'loop-advance',
          },
          text: replacement.text,
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
 * (catalog 5.4 S1). A swap is listed only where the target may be nullish
 * (`||=`) or always (`??=`), as skipped where it does not distinguish values.
 *
 * @param node - Assignment with `&&=`, `||=` or `??=`.
 * @param context - Mutator context of the file.
 * @returns New operators, with null for the assignment that never happens, and
 *   the skip of each.
 */
function getLogicalVariants(
  node: AssignmentExpression,
  context: MutatorContext<AssignmentOperatorOptions>,
): LogicalVariant[] {
  let { right, left } = node
  let leftType = context.hints.getType(left)
  let nullable = mayBeNullish(leftType)
  let distinguishes = distinguishesNullishSwap(
    { right, left },
    context.hints,
    context.options.nullishSwap,
  )
  let alwaysNullish: SkipNote | null =
    isAlwaysNullish(leftType) ?
      {
        reason:
          'the type hints make the target always nullish, so the guard changes nothing',
        rule: 'typed-constant',
      }
    : null
  let guard = getGuardSkip(leftType, right)
  let nullishSwap: SkipNote = {
    reason:
      '??= and ||= differ here only on falsy values that the nullishSwap option does not count, such as the value itself',
    rule: 'nullish-swap',
  }
  let subsumed: SkipNote = {
    reason:
      'the swap between ??= and ||= replaces this variant: every test that kills the swap also kills it',
    by: { mutator: 'assignment-operator', node },
    rule: 'swap-subsumes-drop',
  }
  switch (node.operator) {
    case '&&=':
      return [
        { operator: '=', skip: guard },
        { skip: alwaysNullish, operator: null },
      ]
    case '||=': {
      let variants: LogicalVariant[] = [{ skip: alwaysNullish, operator: '=' }]
      if (nullable && distinguishes) {
        variants.push(
          { operator: '??=', skip: null },
          { skip: subsumed, operator: null },
        )
      } else {
        if (nullable) {
          variants.push({ skip: nullishSwap, operator: '??=' })
        }
        variants.push({ operator: null, skip: guard })
      }
      return variants
    }
    default:
      return [
        distinguishes ?
          { operator: '||=', skip: null }
        : { skip: nullishSwap, operator: '||=' },
        { skip: distinguishes ? subsumed : alwaysNullish, operator: '=' },
        {
          skip:
            nullable ? null : (
              {
                reason:
                  'the type hints make the target never nullish, so the assignment never happens anyway',
                rule: 'never-nullish',
              }
            ),
          operator: null,
        },
      ]
  }
}

/**
 * Decides whether the swap of an arithmetic or bitwise compound assignment is
 * skipped (catalog 4.3): a `+=` that is not known to be numeric (NOISE), or an
 * identity of the operator (EQ; for `+=` and `-=` only once the hints make the
 * target a number).
 *
 * @param node - Arithmetic or bitwise compound assignment.
 * @param swap - Operator written in place of the operator.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getSwapSkip(
  node: AssignmentExpression,
  swap: string,
  context: MutatorContext,
): SkipNote | null {
  let { operator, right, left } = node
  let leftType = context.hints.getType(left)
  if (
    operator === '+=' &&
    !isNumericPair(leftType, context.hints.getType(right))
  ) {
    return {
      reason:
        'the += is not known to be numeric, and -= on a string only gives NaN',
      rule: 'non-numeric-plus',
    }
  }
  let value = getLiteralValue(right)
  if (
    value !== null &&
    identities.get(operator)?.has(value) &&
    (operator !== '-=' || isNumberType(leftType))
  ) {
    let additive = operator === '+=' || operator === '-='
    return {
      reason: `with the value ${String(value)}, ${operator} and ${swap} give the same result`,
      rule: additive ? 'numeric-identity' : 'identity-operand',
    }
  }
  return null
}

/**
 * Builds the mutants of a compound assignment (catalog 4.3): the swap of an
 * arithmetic or bitwise operator, or the variants of a logical assignment, each
 * with its skip.
 *
 * @param node - Assignment with an operator other than `=`.
 * @param context - Mutator context of the file.
 * @returns Replacements of the assignment, skipped ones included.
 */
function getReplacements(
  node: AssignmentExpression,
  context: MutatorContext<AssignmentOperatorOptions>,
): Replacement[] {
  let { sourceCode } = context
  let swap = swaps.get(node.operator)
  if (swap !== undefined) {
    let text = sourceCode.replaceOperator(node, swap)
    let skip = getSwapSkip(node, swap, context)
    return [skip ? { text, skip, node } : { text, node }]
  }
  return getLogicalVariants(node, context).map(({ operator, skip }) => {
    let text =
      operator === null ?
        getTargetText(node, sourceCode)
      : sourceCode.replaceOperator(node, operator)
    return skip ? { text, skip, node } : { text, node }
  })
}

/**
 * Decides whether the truth of the target cannot change the result of a `&&=`
 * or `||=` (catalog 4.3, EQ): the target is always truthy, or it is never
 * nullish and the assigned value is the only falsy value of its type. Then `a
 * &&= b` equals `a = b`, and `a ||= b` equals `a`.
 *
 * @param target - Type of the assignment target.
 * @param right - Assigned value.
 * @returns Rule and reason of the skip of the variant that ignores the guard,
 *   or null when that variant is emitted.
 */
function getGuardSkip(target: InferredType, right: Node): SkipNote | null {
  if (isAlwaysTruthy(target)) {
    return {
      reason:
        'the type hints make the target always truthy, so its truth never changes the result',
      rule: 'typed-constant',
    }
  }
  if (
    !mayBeNullish(target) &&
    isCanonicalFalsy(getTypeView(target).type, right)
  ) {
    return {
      reason:
        "the assigned value is the only falsy value of the target's type, so the target's truth never changes the result",
      rule: 'canonical-falsy-default',
    }
  }
  return null
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
