import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  LogicalExpression,
  DoWhileStatement,
  ChainExpression,
  WhileStatement,
  CallExpression,
  ForStatement,
  IfStatement,
  Node,
} from 'oxc-parser'

import type { TimerCall } from './timer-call'
import type { NodeSlot } from './node-slot'

/**
 * Questions about the syntactic position of a node. Unless stated otherwise,
 * every predicate looks through parentheses and TypeScript expression
 * wrappers.
 */
export interface SyntaxHelpers {
  /**
   * Loops that run forever and that the `break` or `return` ending the
   * consequent of the statement leaves, innermost first; empty when the
   * statement is not an exit test of such a loop.
   */
  getExitedLoops(
    node: IfStatement,
  ): (DoWhileStatement | WhileStatement | ForStatement)[]

  /**
   * Nearest function whose parameters or body contain the node, or null at the
   * top level.
   */
  getEnclosingFunction(
    node: Node,
  ): ArrowFunctionExpression | FunctionNode | null

  /**
   * Known timer call with the index of its delay argument and whether awaiting
   * it only waits, or null: `setTimeout` and `setInterval` (global, imported
   * from `node:timers` or a method), or the promise timers of
   * `node:timers/promises` and `scheduler.wait`.
   */
  readTimerCall(node: CallExpression): TimerCall | null

  /**
   * Operands of the same-operator chain below the node, left to right. Operands
   * that are, through parentheses, logical expressions with the same operator
   * are expanded: `a && (b && c)` gives `a`, `b`, `c`.
   */
  getLogicalChain(node: LogicalExpression): Node[]

  /**
   * ChainExpression whose optional chain the node is part of, or the node
   * itself when it is a ChainExpression.
   */
  getChainRoot(node: Node): ChainExpression | null

  /**
   * Whether the node is a logging call of the `loggers` setting: a `console`
   * method, a log method of another logger receiver, or a bare logger function
   * called with a string or template literal first. The mutants that can only
   * change the text it writes are skipped (see `isLogMessage`).
   */
  isLoggingCall(node: CallExpression): boolean

  /**
   * Statements of the list that holds the statement (a Program, block, static
   * block, namespace body or switch case), or null when the statement is the
   * single body of an `if`, a loop, a label or `with`.
   */
  getStatementList(node: Node): Node[] | null

  /**
   * Names of an identifier, `this` and non-computed member chain, such as
   * `['this', 'logger', 'info']`, or null when a part has no static name.
   */
  getMemberPath(node: Node): string[] | null

  /**
   * Smallest value the expression can have, when syntax alone tells it, also
   * through a `const` or a never-written `let` binding.
   */
  getLowerBound(node: Node): number | null

  /**
   * Whether the node is the whole right-hand side of an `=` assignment to a
   * name that a loop around it reads to decide whether to go on.
   */
  isLoopAdvanceValue(node: Node): boolean

  /**
   * Whether only the truthiness of the value is used.
   */
  isBooleanContext(node: Node): boolean

  /**
   * Whether the node is an operand of `&&`, `||` or `??`.
   */
  isLogicalOperand(node: Node): boolean

  /**
   * Whether `return await` would differ from `return` at the node: inside the
   * `try` block of a try statement, or inside its `catch` block when it has a
   * `finally` block, without crossing a function boundary.
   */
  isInsideTryBlock(node: Node): boolean

  /**
   * Where the node sits once parentheses and TypeScript expression wrappers
   * around it are skipped.
   */
  getContextSlot(node: Node): NodeSlot

  /**
   * Whether the node is the test of an `if` statement or a conditional
   * expression.
   */
  isConditionTest(node: Node): boolean

  /**
   * Whether a replacement may stand in place of the node: an expression whose
   * value is read and that the mutant switch can wrap.
   */
  isValuePosition(node: Node): boolean

  /**
   * Whether the node is part of the message of an error.
   */
  isErrorMessage(node: Node): boolean

  /**
   * Whether the value of the expression is discarded.
   */
  isResultUnused(node: Node): boolean

  /**
   * Strips ParenthesizedExpression wrappers.
   */
  unwrapParentheses(node: Node): Node

  /**
   * Whether the node is the key of a property, method or class member, computed
   * or not.
   */
  isPropertyKey(node: Node): boolean

  /**
   * Strips ParenthesizedExpression and TypeScript expression wrappers.
   */
  unwrapExpression(node: Node): Node

  /**
   * Whether the node is part of the runtime tree of the file. Scope analysis
   * also sees nodes outside it, such as ambient declarations and the arguments
   * of logging calls, which the tree-bound helpers do not accept.
   */
  isRuntimeNode(node: Node): boolean

  /**
   * Whether a mutant of the node can only change the text a logging call
   * writes, so it is skipped: the node is a literal text of the call, or the
   * statement of a call whose removal can only remove that text (see
   * `isLogMessage`).
   */
  isLogMessage(node: Node): boolean

  /**
   * Whether the value of the node only reaches the delay argument of a known
   * timer call, through arithmetic, conditional branches and right operands of
   * logical expressions.
   */
  isTimerDelay(node: Node): boolean

  /**
   * Whether the update, assignment or statement changes a name that a loop
   * around it reads to decide whether to go on.
   */
  advancesLoop(node: Node): boolean

  /**
   * Whether the node is the test of a `for`, `while` or `do...while` loop.
   */
  isLoopTest(node: Node): boolean
}
