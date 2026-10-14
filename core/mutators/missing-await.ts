import type { VariableDeclaration, AwaitExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Mutator } from '../../types/mutator'

import { isBooleanModeOperand } from './shared/is-boolean-mode-operand'
import { isTypedByMethodName } from './shared/is-typed-by-method-name'
import { createRunContext } from './shared/create-run-context'
import { isNumberType } from './shared/is-number-type'
import { isComparison } from './shared/is-comparison'
import { getTypeView } from './shared/get-type-view'
import { isFunction } from '../syntax/is-function'

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
 * rejection.
 */
export let missingAwait: Mutator = {
  create(context) {
    return {
      AwaitExpression(node) {
        if (
          isAwaitedByCaller(node, context) ||
          isComparisonConstant(node, context) ||
          isSettled(node, context)
        ) {
          return []
        }
        return [{ text: context.sourceCode.getText(node.argument), node }]
      },
    }
  },
  meta: {
    description: 'Removes an await, as if the promise was not awaited.',
  },
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
  let { sourceCode, syntax } = context
  let { parent } = syntax.getContextSlot(node)
  switch (parent?.type) {
    case 'ArrowFunctionExpression':
      return true
    case 'VariableDeclarator':
      break
    case 'YieldExpression':
      return !parent.delegate
    case 'ReturnStatement':
      return !isAwaitObserved(parent, context)
    default:
      return false
  }
  let binding = sourceCode.getBinding(parent.id)
  let enclosing = syntax.getEnclosingFunction(parent)
  if (
    !binding ||
    (binding.kind !== 'const' && binding.kind !== 'let') ||
    binding.references.length !== 1 ||
    !enclosing?.async
  ) {
    return false
  }
  let declaration = sourceCode.getParent(parent) as VariableDeclaration
  if (declaration.declarations.at(-1) !== parent) {
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
 * Tells whether the `await` is an operand of a comparison whose other operand
 * is a primitive, so that the mutant makes the comparison constant: in a
 * boolean-mode operand that constant belongs to logical-operator (O3);
 * otherwise comparison-operator's mutants cover it while that mutator will run
 * on the comparison (R8).
 *
 * @param node - Await expression.
 * @param context - Mutator context of the file.
 * @returns Whether the mutant is skipped.
 */
function isComparisonConstant(
  node: AwaitExpression,
  context: MutatorContext,
): boolean {
  let { syntax, hints } = context
  let { parent: comparison, key } = syntax.getContextSlot(node)
  if (
    !isComparison(comparison) ||
    comparison.operator === 'instanceof' ||
    comparison.operator === 'in'
  ) {
    return false
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
  )
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
