import type { SwitchStatement, SwitchCase, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { isFunction } from '../../syntax/is-function'

/**
 * Tells whether completing a statement normally ends its function (catalog 2.2,
 * tail position): it is the last statement of the function body, or of a block
 * in tail position, the consequent or alternate of an `if` in tail position,
 * the `try` block, a `catch` body or the `finally` block of a `try` in tail
 * position, the body of a labeled statement in tail position, or the last
 * statement of a case of a `switch` in tail position when every later case is
 * empty.
 *
 * @param node - Statement of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the statement is in tail position.
 */
export function isTailPosition(node: Node, context: MutatorContext): boolean {
  let current = node
  for (;;) {
    let { parent } = context.sourceCode.getSlot(current)
    switch (parent?.type) {
      case 'LabeledStatement':
      case 'SwitchStatement':
      case 'TryStatement':
      case 'IfStatement':
      case 'CatchClause':
        break
      case 'BlockStatement': {
        if (parent.body.at(-1) !== current) {
          return false
        }
        if (isFunction(context.sourceCode.getSlot(parent).parent!)) {
          return true
        }
        break
      }
      case 'SwitchCase': {
        if (!isSwitchEnd(parent, current, context)) {
          return false
        }
        break
      }
      default:
        return false
    }
    current = parent!
  }
}

/**
 * Tells whether completing a statement of a case reaches the end of its
 * `switch`: the statement is the last of the case and every later case is
 * empty, so control falls through to the end.
 *
 * @param switchCase - Case that holds the statement.
 * @param statement - Statement of the case.
 * @param context - Mutator context of the file.
 * @returns Whether the statement ends the switch.
 */
function isSwitchEnd(
  switchCase: SwitchCase,
  statement: Node,
  context: MutatorContext,
): boolean {
  let { cases } = context.sourceCode.getParent(switchCase) as SwitchStatement
  return (
    switchCase.consequent.at(-1) === statement &&
    cases
      .slice(cases.indexOf(switchCase) + 1)
      .every(later => later.consequent.length === 0)
  )
}
