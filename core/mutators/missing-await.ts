import type {
  VariableDeclaration,
  VariableDeclarator,
  AwaitExpression,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { isBooleanModeOperand } from './shared/is-boolean-mode-operand'
import { isTypedByMethodName } from './shared/is-typed-by-method-name'
import { createRunContext } from './shared/create-run-context'
import { getNegationTop } from './shared/get-negation-top'
import { isNumberType } from './shared/is-number-type'
import { isComparison } from './shared/is-comparison'
import { isTimerWait } from './shared/is-timer-wait'
import { getTypeView } from './shared/get-type-view'
import { isFunction } from '../syntax/is-function'
import { skipRules } from '../skips/skip-rules'

/**
 * Types whose values are not thenable: awaiting them only changes timing.
 */
let settledTypes = new Set([
  'function',
  'boolean',
  'nullish',
  'string',
  'number',
  'bigint',
  'array',
])

/**
 * Types of an equality operand that a promise never equals.
 */
let primitiveTypes = new Set([
  'boolean',
  'nullish',
  'string',
  'number',
  'bigint',
])

/**
 * Relational operators: a promise compares as `NaN` with a number.
 */
let relationalOperators = new Set(['<=', '>=', '<', '>'])

/**
 * Removes an await, as if the promise was not awaited (catalog 4.10). The
 * mutant is skipped when the caller awaits the same promise (`return await x`,
 * a concise body, `yield await x` in an async generator, or a local returned by
 * the next statement), when it makes a comparison with a primitive constant
 * (O3, R8), and when the awaited value is not a promise by its type. An `await`
 * whose truthiness alone is used, as in a condition test, keeps its mutant: a
 * promise is always truthy, but the constants of the decision's owner skip the
 * awaited call, while the mutant still makes it, with its effects and its
 * rejection. An `await` that only waits for a promise timer, such as `await
 * setTimeout(1000)` of `node:timers/promises`, is skipped as a timer delay. The
 * removal of an `await` that is the operand of another `await` leaves the same
 * code as the removal of the outer one, so it is skipped as a duplicate while
 * that removal is skipped. Skipped mutants follow as skipped replacements.
 */
export let missingAwait: Mutator = {
  create(context) {
    return {
      AwaitExpression(node) {
        let text = context.sourceCode.getText(node.argument)
        let skip = getAwaitSkip(node, context)
        return [skip ? { text, skip, node } : { text, node }]
      },
    }
  },
  meta: {
    description: 'Removes an await, as if the promise was not awaited.',
  },
}

/**
 * Decides whether the removal of an `await` is skipped (catalog 4.10): the
 * caller awaits the same promise (EQ), the `await` only waits for a promise
 * timer (NOISE), the removal makes a comparison with a primitive constant (O3,
 * R8), the awaited value is not a promise by its type (EQ), or the `await` is
 * the operand of another `await` whose removal is skipped (duplicate).
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getAwaitSkip(
  node: AwaitExpression,
  context: MutatorContext,
): SkipNote | null {
  if (isAwaitedByCaller(node, context)) {
    return {
      reason: 'the caller awaits the same promise without the await',
      rule: 'awaited-by-caller',
    }
  }
  if (isTimerWait(node, context)) {
    return {
      reason: 'awaiting a timer only waits for its delay',
      rule: 'timer-delay',
    }
  }
  let comparison = getConstantComparison(node, context)
  if (comparison) {
    return isBooleanModeOperand(comparison, context) ?
        {
          by: {
            node: context.syntax.getContextSlot(
              getNegationTop(comparison, context).node,
            ).parent!,
            mutator: 'logical-operator',
          },
          reason:
            'it makes the comparison constant, and logical-operator owns the truth value of an operand of && or ||',
          rule: 'O3',
        }
      : {
          reason:
            "it makes the comparison constant, which comparison-operator's mutants cover",
          by: { mutator: 'comparison-operator', node: comparison },
          rule: 'R8',
        }
  }
  if (isSettled(node, context)) {
    return {
      reason:
        'the type hints say the value is not a promise, so the await only changes timing',
      rule: 'settled-value',
    }
  }
  return getNestedAwaitSkip(node, context)
}

/**
 * Tells whether a declarator whose whole initializer is an `await` declares a
 * local that the next statement returns (EQ): the last declarator of a `const`
 * (or never-written `let`) local of an async function, when the local's only
 * reference, inside the runtime tree, is the argument of the next statement, a
 * `return` that does not lie where a promise that is not awaited settles later
 * than the code around it.
 *
 * @param declarator - Declarator whose initializer is the `await`.
 * @param context - Mutator context of the file.
 * @returns Whether the caller awaits the promise the local would hold.
 */
function isReturnedLocal(
  declarator: VariableDeclarator,
  context: MutatorContext,
): boolean {
  let { sourceCode, syntax } = context
  let binding = sourceCode.getBinding(declarator.id)
  let enclosing = syntax.getEnclosingFunction(declarator)
  if (
    !binding ||
    (binding.kind !== 'const' && binding.kind !== 'let') ||
    binding.references.length !== 1 ||
    !enclosing?.async
  ) {
    return false
  }
  let declaration = sourceCode.getParent(declarator) as VariableDeclaration
  if (declaration.declarations.at(-1) !== declarator) {
    return false
  }
  let list = syntax.getStatementList(declaration) ?? []
  let next = list[list.indexOf(declaration) + 1]
  let [reference] = binding.references
  return (
    next?.type === 'ReturnStatement' &&
    syntax.isRuntimeNode(reference!) &&
    syntax.getContextSlot(reference!).parent === next &&
    !isAwaitObserved(next, context)
  )
}

/**
 * Finds the comparison that the removal of an `await` makes constant: the
 * `await` is an operand of a comparison whose other operand is a primitive, and
 * the comparison is a boolean-mode operand, whose constant belongs to
 * logical-operator (O3), or comparison-operator will run on it, whose mutants
 * cover the constant (R8).
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns The comparison, or null when the mutant is not skipped for it.
 */
function getConstantComparison(
  node: AwaitExpression,
  context: MutatorContext,
): Node | null {
  let { syntax, hints } = context
  let { parent: comparison, key } = syntax.getContextSlot(node)
  if (
    !isComparison(comparison) ||
    comparison.operator === 'instanceof' ||
    comparison.operator === 'in'
  ) {
    return null
  }
  let other = key === 'left' ? comparison.right : comparison.left
  let constant =
    relationalOperators.has(comparison.operator) ?
      isNumberType(hints.getType(other))
    : primitiveTypes.has(getTypeView(hints.getType(other)).type)
  return (
      constant &&
        (isBooleanModeOperand(comparison, context) ||
          createRunContext(context).runs(
            { mutator: 'comparison-operator', node: comparison },
            { mutator: context.id, node },
          ))
    ) ?
      comparison
    : null
}

/**
 * Skips the removal of an `await` that is the operand of another `await`, as in
 * `await await x`, while the removal of the outer `await` is skipped, by this
 * mutator or, without the `timeouts` setting, by the collection as the value
 * that advances a loop: removing either one leaves the same code, up to
 * parentheses, and deduplication only compares the candidates that are not
 * skipped. The skip is a heuristic when the skip of the outer removal is one.
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Duplicate skip that names the outer `await`, or null when the
 *   `await` is not the operand of another one or the outer removal is emitted.
 */
function getNestedAwaitSkip(
  node: AwaitExpression,
  context: MutatorContext,
): SkipNote | null {
  let { settings, syntax } = context
  let { parent } = syntax.getContextSlot(node)
  if (parent?.type !== 'AwaitExpression') {
    return null
  }
  let skip = getAwaitSkip(parent, context)
  if (!skip && (settings.timeouts || !syntax.isLoopAdvanceValue(parent))) {
    return null
  }
  return {
    heuristic:
      skip !== null &&
      (skipRules[skip.rule].heuristic || skip.heuristic === true),
    reason:
      'it produces the same code as the removal of the outer await, which is skipped',
    by: { mutator: context.id, node: parent },
    rule: 'duplicate',
  }
}

/**
 * Tells whether a promise that is not awaited would settle after code that the
 * `return` runs on the way out: the `return` lies in a `try` block, in a
 * `catch` block whose `try` has a `finally` block, or after a `using` or `await
 * using` declaration of an enclosing block or in the head of an enclosing
 * `for`, `for...in` or `for...of` loop, within the same function.
 *
 * @param statement - Return statement.
 * @param context - Mutator context of the file.
 * @returns Whether `return await x` and `return x` differ there.
 */
function isAwaitObserved(statement: Node, context: MutatorContext): boolean {
  let { sourceCode, syntax } = context
  if (syntax.isInsideTryBlock(statement)) {
    return true
  }
  let current = statement
  while (!isFunction(current)) {
    let list = syntax.getStatementList(current) ?? []
    if (
      list.slice(0, list.indexOf(current)).some(isUsingDeclaration) ||
      isUsingDeclaration(getLoopHead(current))
    ) {
      return true
    }
    current = sourceCode.getParent(current)!
  }
  return false
}

/**
 * Tells whether the caller awaits the same promise without the `await` (EQ):
 * the `await` is the returned value, a concise arrow body or the operand of a
 * `yield` (not `yield*`), which an async generator awaits itself, or the whole
 * initializer of the last declarator of a `const` (or never-written `let`)
 * local of an async function that the next statement returns as the local's
 * only reference; unless the `return` lies where a promise that is not awaited
 * settles later than the code around it. A later declarator of the same
 * declaration would run before the promise settles. A reference outside the
 * runtime tree, such as an argument of a logging call, is not returned.
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Whether removing the `await` changes nothing for the caller.
 */
function isAwaitedByCaller(
  node: AwaitExpression,
  context: MutatorContext,
): boolean {
  let { parent } = context.syntax.getContextSlot(node)
  switch (parent?.type) {
    case 'ArrowFunctionExpression':
      return true
    case 'VariableDeclarator':
      return isReturnedLocal(parent, context)
    case 'YieldExpression':
      return !parent.delegate
    case 'ReturnStatement':
      return !isAwaitObserved(parent, context)
    default:
      return false
  }
}

/**
 * Finds the declaration part of a loop head: the `init` of a `for` loop or the
 * `left` of a `for...in` or `for...of` loop.
 *
 * @param node - Statement on the way from a `return` to its function.
 * @returns The head part, or null when the node is not such a loop.
 */
function getLoopHead(node: Node): Node | null {
  switch (node.type) {
    case 'ForOfStatement':
    case 'ForInStatement':
      return node.left
    case 'ForStatement':
      return node.init
    default:
      return null
  }
}

/**
 * Tells whether the awaited value is not a promise by its type (EQ): a string,
 * number, BigInt, boolean, array, nullish value or function. A call typed only
 * by its method name on a receiver that does not confirm it counts as unknown.
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Whether awaiting the value only changes timing.
 */
function isSettled(node: AwaitExpression, context: MutatorContext): boolean {
  return (
    !isTypedByMethodName(node.argument, context) &&
    settledTypes.has(getTypeView(context.hints.getType(node.argument)).type)
  )
}

/**
 * Tells whether a node is a `using` or `await using` declaration.
 *
 * @param node - Statement of a list or head of a loop, or null.
 * @returns Whether the node declares a resource disposed at block exit.
 */
function isUsingDeclaration(node: Node | null): boolean {
  return node?.type === 'VariableDeclaration' && node.kind.endsWith('using')
}
