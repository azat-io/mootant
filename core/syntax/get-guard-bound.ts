import type {
  AssignmentExpression,
  BindingIdentifier,
  UpdateExpression,
  NumericLiteral,
  WhileStatement,
  IfStatement,
  Node,
} from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { ValueBound } from '../../types/syntax/value-bound'
import type { TreeIndex } from '../../types/syntax/tree-index'
import type { Binding } from '../../types/syntax/binding'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { readNumberLiteral } from './read-number-literal'
import { getLogicalChain } from './get-logical-chain'
import { getRawSlot } from '../tree/get-raw-slot'

/**
 * Comparison of a name with a number literal, with the name on the left.
 */
interface NameComparison {
  /**
   * Operator with the name on the left.
   */
  operator: string

  /**
   * Value of the number literal.
   */
  literal: number

  /**
   * Comparison as a reason quotes it: the name, the operator and the literal as
   * written, in source order.
   */
  text: string
}

/**
 * Operator of a comparison with its operands swapped, for the guards that bound
 * a name from below.
 */
let mirroredOperators = new Map([
  ['!==', '!=='],
  ['<=', '>='],
  ['!=', '!='],
  ['<', '>'],
])

/**
 * Finds the bound that a guard gives a name right before a decrement of it
 * (catalog 3.4, N1c). The decrement must be the whole expression statement that
 * is the consequent of an `if`, or the first statement of the block that is, or
 * the body of a `while`, or the first statement of the block that is, and the
 * test of that `if` or `while` must be, or end its `&&` chain with, a
 * comparison of the name with a number literal: `x >= c` gives `c`, `x > c`
 * gives `c + 1` when the name and the literal are integers and `c` otherwise,
 * and `x !== L` or `x != L` gives `L + 1` when the name is an integer and `L`
 * is its bound before the guard; the literal may be on the left. Nothing runs
 * between such a guard and the decrement. A guard before the last operand is
 * not one: a later operand can run a getter or a coercion that writes the
 * name.
 *
 * @param program - Runtime tree, scope analysis and shared scopes of the
 *   program.
 * @param decrement - Write that lowers a declared name, such as `x--` or `x -=
 *   1`; any other target has no bound.
 * @param current - Bound the name has before the guard.
 * @returns Bound of the name right after the guard, whose reason quotes the
 *   guard in source order, such as "right after `depth > 0`" or "right after `0
 *   < depth`", and which rests on the guard's comparison, or null when no guard
 *   is right before the decrement.
 */
export function getGuardBound(
  program: AnalyzedProgram,
  decrement: AssignmentExpression | UpdateExpression,
  current: ValueBound,
): ValueBound | null {
  let { scopes, tree } = program
  if (!tree.slots.has(decrement)) {
    return null
  }
  let statement = findGuardStatement(tree, decrement)
  if (!statement) {
    return null
  }
  let binding = scopes.bindings.get(
    unwrapExpression(
      decrement.type === 'UpdateExpression' ?
        decrement.argument
      : decrement.left,
    ),
  )
  if (!binding) {
    return null
  }
  let guard = unwrapExpression(getLastOperand(statement.test))
  let comparison = readComparison(scopes, guard, binding)
  if (!comparison) {
    return null
  }
  let lower = getGuardLower(comparison, current)
  return lower === null ? null : (
      {
        because: `right after \`${comparison.text}\``,
        guards: new Set([guard]),
        integer: current.integer,
        nullable: false,
        lower,
      }
    )
}

/**
 * Reads a comparison of a name with a number literal, with the name moved to
 * the left.
 *
 * @param scopes - Scope analysis of the program.
 * @param node - Last operand of the test of a guard.
 * @param binding - Binding of the name.
 * @returns The operator and the literal, with the comparison as a reason quotes
 *   it, or null for any other expression.
 */
function readComparison(
  scopes: ScopeAnalysis,
  node: Node,
  binding: Binding,
): NameComparison | null {
  let guard = unwrapExpression(node)
  if (guard.type !== 'BinaryExpression') {
    return null
  }
  let { name } = binding.identifier as BindingIdentifier
  let literal = readNumberLiteral(guard.right)
  if (literal !== null && refersTo(scopes, guard.left, binding)) {
    return {
      text: `${name} ${guard.operator} ${printLiteral(guard.right)}`,
      operator: guard.operator,
      literal,
    }
  }
  literal = readNumberLiteral(guard.left)
  let operator = mirroredOperators.get(guard.operator)
  return (
      literal !== null &&
        operator !== undefined &&
        refersTo(scopes, guard.right, binding)
    ) ?
      {
        text: `${printLiteral(guard.left)} ${guard.operator} ${name}`,
        operator,
        literal,
      }
    : null
}

/**
 * Finds the `if` or `while` statement whose test runs right before a decrement:
 * the decrement is the whole expression statement that is the consequent of the
 * `if` or the body of the `while`, or the first statement of a block that is.
 *
 * @param tree - Runtime tree of the program.
 * @param decrement - Write of a name in the runtime tree.
 * @returns The statement, or null when the decrement is in no such position.
 */
function findGuardStatement(
  tree: TreeIndex,
  decrement: Node,
): WhileStatement | IfStatement | null {
  let statement = getContextSlot(tree, decrement).parent
  if (statement?.type !== 'ExpressionStatement') {
    return null
  }
  let slot = getRawSlot(tree, statement)
  if (slot.parent?.type === 'BlockStatement') {
    if (slot.index !== 0) {
      return null
    }
    slot = getRawSlot(tree, slot.parent)
  }
  let { parent, key } = slot
  if (
    (key !== 'consequent' || parent?.type !== 'IfStatement') &&
    (key !== 'body' || parent?.type !== 'WhileStatement')
  ) {
    return null
  }
  return parent
}

/**
 * Reads the lower bound of a name from the comparison of its guard: `x >= c`
 * gives `c`, `x > c` gives `c + 1` when the name and the literal are integers
 * and `c` otherwise, and `x !== L` or `x != L` gives `L + 1` when the name is
 * an integer and `L` is its bound before the guard.
 *
 * @param comparison - Comparison of the name with a number literal, with the
 *   name on the left.
 * @param current - Bound the name has before the guard.
 * @returns The smallest number the name can be right after the guard, or null
 *   when the comparison gives none.
 */
function getGuardLower(
  comparison: NameComparison,
  current: ValueBound,
): number | null {
  switch (comparison.operator) {
    case '!==':
    case '!=':
      return current.integer && comparison.literal === current.lower ?
          comparison.literal + 1
        : null
    case '>=':
      return comparison.literal
    case '>':
      return current.integer && Number.isSafeInteger(comparison.literal) ?
          comparison.literal + 1
        : comparison.literal
    default:
      return null
  }
}

/**
 * Tells whether an expression is a reference to a binding.
 *
 * @param scopes - Scope analysis of the program.
 * @param node - Expression, through parentheses and TypeScript wrappers.
 * @param binding - Binding to look for.
 * @returns Whether the expression is a name bound by the binding.
 */
function refersTo(
  scopes: ScopeAnalysis,
  node: Node,
  binding: Binding,
): boolean {
  let current = unwrapExpression(node)
  return (
    current.type === 'Identifier' && scopes.bindings.get(current) === binding
  )
}

/**
 * Finds the last operand of the `&&` chain of a test, or the test itself.
 *
 * @param test - Test of an `if` or `while` statement.
 * @returns The operand that is evaluated last when the test is true.
 */
function getLastOperand(test: Node): Node {
  let condition = unwrapExpression(test)
  return condition.type === 'LogicalExpression' && condition.operator === '&&' ?
      getLogicalChain(condition).at(-1)!
    : condition
}

/**
 * Prints a number literal, or `-` applied to one, as written, without the
 * parentheses and TypeScript wrappers around them: `0x10` stays `0x10`.
 *
 * @param node - Operand that `readNumberLiteral` reads.
 * @returns Text of the literal.
 */
function printLiteral(node: Node): string {
  let current = unwrapExpression(node)
  return current.type === 'UnaryExpression' ?
      `-${printLiteral(current.argument)}`
    : (current as NumericLiteral).raw!
}
