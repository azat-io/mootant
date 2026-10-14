import type {
  ExpressionStatement,
  ContinueStatement,
  ReturnStatement,
  SwitchStatement,
  BreakStatement,
  SwitchCase,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

import { isPlainReturnValue } from './shared/is-plain-return-value'
import { ownerEmitsConstant } from './shared/owner-emits-constant'
import { createRunContext } from './shared/create-run-context'
import { isTailPosition } from './shared/is-tail-position'
import { isMovedToward } from './shared/is-moved-toward'

/**
 * Options of the statement-removal mutator.
 */
interface StatementRemovalOptions {
  /**
   * Whether `continue`, loop and labeled `break` and `yield` statements are
   * removed.
   */
  jumps: boolean
}

/**
 * Expressions whose statement always has an effect.
 */
let effectTypes = new Set<Node['type']>([
  'AssignmentExpression',
  'UpdateExpression',
  'AwaitExpression',
  'NewExpression',
])

/**
 * Loops whose body a `continue` can end.
 */
let loopTypes = new Set<Node['type'] | undefined>([
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'ForStatement',
])

/**
 * Removes one statement with an effect: a call, assignment, delete, throw,
 * early return or case break (catalog 4.15). With `jumps`, `continue`, loop and
 * labeled `break` and `yield` statements are removed too. The removal is
 * solitary (2.6), except for a plain assignment; it is skipped for the body of
 * a label, for the whole then-branch of an `if` whose test its owner forces to
 * `false` (O19) or a mutant moves toward `false` (R4), and for a statement that
 * advances a loop while timeouts are off.
 */
export let statementRemoval: Mutator<StatementRemovalOptions> = {
  create(context) {
    let { jumps } = context.options
    return {
      ContinueStatement(node, parent) {
        return jumps && !isLoopEnd(node, context) ?
            getRemoval(node, parent, context)
          : []
      },
      ReturnStatement(node, parent) {
        return isRemovableReturn(node, context) ?
            getRemoval(node, parent, context)
          : []
      },
      BreakStatement(node, parent) {
        return isRemovableBreak(node, context) ?
            getRemoval(node, parent, context)
          : []
      },
      ExpressionStatement(node, parent) {
        return hasEffect(node, context) ? getRemoval(node, parent, context) : []
      },
      ThrowStatement(node, parent) {
        return getRemoval(node, parent, context)
      },
    }
  },
  meta: {
    description:
      'Removes one statement with an effect: a call, assignment, delete, throw, early return or case break.',
    defaultOptions: { jumps: false },
  },
}

/**
 * Tells whether an expression statement has an effect the mutator removes: a
 * call (not of `super`, not a logging call), also in an optional chain, `new`,
 * `await`, an assignment, an update, `delete`, `void` applied to a call, `new`
 * or `await`, and with `jumps` a `yield`.
 *
 * @param node - Expression statement.
 * @param context - Mutator context of the file.
 * @returns Whether the statement is removed.
 */
function hasEffect(
  node: ExpressionStatement,
  context: MutatorContext<StatementRemovalOptions>,
): boolean {
  let { syntax } = context
  let expression = syntax.unwrapExpression(node.expression)
  switch (expression.type) {
    case 'ChainExpression':
    case 'CallExpression': {
      let call =
        expression.type === 'ChainExpression' ?
          expression.expression
        : expression
      return (
        call.type === 'CallExpression' &&
        call.callee.type !== 'Super' &&
        !syntax.isLoggingCall(call)
      )
    }
    case 'UnaryExpression':
      return (
        expression.operator === 'delete' ||
        (expression.operator === 'void' &&
          isCallLike(syntax.unwrapExpression(expression.argument)))
      )
    case 'YieldExpression':
      return context.options.jumps
    default:
      return effectTypes.has(expression.type)
  }
}

/**
 * Tells whether a statement is the whole then-branch of an `if` without `else`
 * whose removal another mutant covers (catalog 4.15): removing it forces the
 * test to `false`, which the test's owner emits (O19, static) or a mutant that
 * will run moves the test toward (R4).
 *
 * @param node - Statement to remove.
 * @param context - Mutator context of the file.
 * @returns Whether the removal is skipped.
 */
function isForcedThenBranch(node: Node, context: MutatorContext): boolean {
  let { sourceCode, syntax } = context
  let { parent } = sourceCode.getSlot(node)
  if (parent?.type === 'BlockStatement' && parent.body.length === 1) {
    ;({ parent } = sourceCode.getSlot(parent))
  }
  if (parent?.type !== 'IfStatement' || parent.alternate) {
    return false
  }
  let test = syntax.unwrapParentheses(parent.test)
  return (
    ownerEmitsConstant(test, false, context) ||
    isMovedToward(
      {
        candidate: { mutator: context.id, node },
        decision: test,
        value: false,
      },
      createRunContext(context),
    )
  )
}

/**
 * Finds the switch case that an unlabeled `break` ends: the `break` is the last
 * statement of the case, directly or as the last statement of a block that is
 * the case's only statement.
 *
 * @param node - Unlabeled break statement.
 * @param context - Mutator context of the file.
 * @returns The case, or null for any other `break`.
 */
function getEndedCase(
  node: BreakStatement,
  context: MutatorContext,
): SwitchCase | null {
  let { sourceCode } = context
  let last: Node = node
  let { parent } = sourceCode.getSlot(node)
  if (parent?.type === 'BlockStatement' && parent.body.at(-1) === node) {
    let { parent: outer } = sourceCode.getSlot(parent)
    if (outer?.type === 'SwitchCase' && outer.consequent.length === 1) {
      last = parent
      parent = outer
    }
  }
  return parent?.type === 'SwitchCase' && parent.consequent.at(-1) === last ?
      parent
    : null
}

/**
 * Tells whether falling through a case reaches only a `break` (EQ): the next
 * case with statements starts with an unlabeled `break`, or no later case has
 * statements.
 *
 * @param switchCase - Case whose `break` is removed.
 * @param context - Mutator context of the file.
 * @returns Whether the removal changes nothing.
 */
function fallsThroughToBreak(
  switchCase: SwitchCase,
  context: MutatorContext,
): boolean {
  let { cases } = context.sourceCode.getParent(switchCase) as SwitchStatement
  let next = cases
    .slice(cases.indexOf(switchCase) + 1)
    .find(later => later.consequent.length > 0)
  if (!next) {
    return true
  }
  let first = next.consequent[0]!
  let start =
    first.type === 'BlockStatement' && next.consequent.length === 1 ?
      first.body[0]
    : first
  return start?.type === 'BreakStatement' && start.label === null
}

/**
 * Tells whether a `continue` ends the body of the loop it continues (EQ): it is
 * the body, or the last statement of the block that is the body, and it is
 * unlabeled or names that loop.
 *
 * @param node - Continue statement.
 * @param context - Mutator context of the file.
 * @returns Whether removing it changes nothing.
 */
function isLoopEnd(node: ContinueStatement, context: MutatorContext): boolean {
  let { sourceCode } = context
  let { parent } = sourceCode.getSlot(node)
  if (parent?.type === 'BlockStatement' && parent.body.at(-1) === node) {
    ;({ parent } = sourceCode.getSlot(parent))
  }
  if (!loopTypes.has(parent?.type)) {
    return false
  }
  let { parent: labeled } = sourceCode.getSlot(parent!)
  return (
    !node.label ||
    (labeled?.type === 'LabeledStatement' &&
      labeled.label.name === node.label.name)
  )
}

/**
 * Tells whether removing a `return` in tail position changes nothing, or only
 * turns `null` into `undefined` (EQ), or only turns `false` into `undefined`
 * (NOISE): an absent value, `undefined`, `void` of a literal or a name, `null`
 * and `false`.
 *
 * @param value - Returned expression, through wrappers, or null.
 * @param context - Mutator context of the file.
 * @returns Whether the tail `return` is kept.
 */
function isTailNoOp(value: Node | null, context: MutatorContext): boolean {
  if (!value) {
    return true
  }
  if (value.type === 'Literal') {
    return value.value === null || value.value === false
  }
  if (value.type === 'UnaryExpression') {
    let operand = context.syntax.unwrapExpression(value.argument)
    return (
      value.operator === 'void' &&
      (operand.type === 'Literal' || operand.type === 'Identifier')
    )
  }
  return value.type === 'Identifier'
}

/**
 * Builds the removal of a statement, unless it is the body of a label, a
 * then-branch whose removal another mutant covers, or a loop advance while
 * timeouts are off.
 *
 * @param node - Statement to remove.
 * @param parent - Parent of the statement.
 * @param context - Mutator context of the file.
 * @returns The replacement, or none.
 */
function getRemoval(
  node: Node,
  parent: Node | null,
  context: MutatorContext,
): readonly Replacement[] {
  if (
    parent?.type === 'LabeledStatement' ||
    isForcedThenBranch(node, context) ||
    (!context.settings.timeouts && context.syntax.advancesLoop(node))
  ) {
    return []
  }
  return [
    isPlainAssignment(node, context) ?
      { text: ';', node }
    : { solitary: [node], text: ';', node },
  ]
}

/**
 * Tells whether a `return` is removed: its argument is absent or one that
 * return-value never replaces (a literal, a negative number literal,
 * `undefined`, `void x`, `this`, a function or class expression), and it is not
 * a `return;`, `return undefined;`, `return void 0;`, `return null;` (EQ) or
 * `return false;` (NOISE) in tail position.
 *
 * @param node - Return statement.
 * @param context - Mutator context of the file.
 * @returns Whether the statement is removed.
 */
function isRemovableReturn(
  node: ReturnStatement,
  context: MutatorContext,
): boolean {
  let value =
    node.argument ? context.syntax.unwrapExpression(node.argument) : null
  if (value && !isPlainReturnValue(value, context)) {
    return false
  }
  return !isTailPosition(node, context) || !isTailNoOp(value, context)
}

/**
 * Tells whether a statement is a plain `=` assignment, whose removal is not
 * solitary (catalog 2.6): the removal keeps the previous value, so a test kills
 * it only when the previous state differs from the assigned value, while a
 * mutant of the assigned value only shows that the value is observed.
 *
 * @param node - Removed statement.
 * @param context - Mutator context of the file.
 * @returns Whether the statement is a plain assignment.
 */
function isPlainAssignment(node: Node, context: MutatorContext): boolean {
  if (node.type !== 'ExpressionStatement') {
    return false
  }
  let expression = context.syntax.unwrapExpression(node.expression)
  return (
    expression.type === 'AssignmentExpression' && expression.operator === '='
  )
}

/**
 * Tells whether an expression is a call, `new` or `await`, or a call in an
 * optional chain.
 *
 * @param node - Expression, through wrappers.
 * @returns Whether the expression is call-like.
 */
function isCallLike(node: Node): boolean {
  switch (node.type) {
    case 'ChainExpression':
      return node.expression.type === 'CallExpression'
    case 'AwaitExpression':
    case 'CallExpression':
    case 'NewExpression':
      return true
    default:
      return false
  }
}

/**
 * Tells whether a `break` is removed: a case `break` whose fall-through reaches
 * more than a `break`, and with `jumps` every other `break`.
 *
 * @param node - Break statement.
 * @param context - Mutator context of the file.
 * @returns Whether the statement is removed.
 */
function isRemovableBreak(
  node: BreakStatement,
  context: MutatorContext<StatementRemovalOptions>,
): boolean {
  let switchCase = node.label ? null : getEndedCase(node, context)
  return switchCase ?
      !fallsThroughToBreak(switchCase, context)
    : context.options.jumps
}
