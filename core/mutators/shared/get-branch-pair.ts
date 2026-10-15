import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getReturnedValue } from './get-returned-value'

/**
 * Two branches chosen by one test, seen from one of them.
 */
export interface BranchPair {
  /**
   * The test forced to this value gives every input the other branch: false
   * when the node is the branch taken on true, true otherwise.
   */
  forced: boolean

  /**
   * The other branch, without parentheses.
   */
  other: Node

  /**
   * Test of the pair, without parentheses.
   */
  test: Node
}

/**
 * Finds the branch pair of a node (catalog 2.2): the node is, through wrappers,
 * a branch of `t ? A : B`, or the argument of a `return` in `if (t) return A`
 * directly followed by `return B` in the same statement list, or in `if (t)
 * return A; else return B` (each branch the `return` itself or a block that
 * holds only it). A mutant that gives the node the value of the other branch
 * forces the test to a constant.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The other branch, the test and the forced value, or null.
 */
export function getBranchPair(
  node: Node,
  context: MutatorContext,
): BranchPair | null {
  let { sourceCode, syntax } = context
  let { parent, key } = syntax.getContextSlot(node)
  if (parent?.type === 'ConditionalExpression') {
    return key === 'test' ? null : (
        {
          other: unwrapParentheses(
            key === 'consequent' ? parent.alternate : parent.consequent,
          ),
          test: unwrapParentheses(parent.test),
          forced: key !== 'consequent',
        }
      )
  }
  if (parent?.type !== 'ReturnStatement') {
    return null
  }
  let branch: Node = parent
  let holder = sourceCode.getSlot(branch)
  if (
    holder.parent?.type === 'BlockStatement' &&
    holder.parent.body.length === 1 &&
    sourceCode.getSlot(holder.parent).parent?.type === 'IfStatement'
  ) {
    branch = holder.parent
    holder = sourceCode.getSlot(branch)
  }
  if (holder.parent?.type === 'IfStatement') {
    let { consequent, alternate, test } = holder.parent
    let other = getReturnedValue(
      holder.key === 'consequent' ?
        (alternate ?? getNextReturn(holder.parent, context))
      : consequent,
    )
    return other ?
        {
          forced: holder.key !== 'consequent',
          test: unwrapParentheses(test),
          other,
        }
      : null
  }
  let list = syntax.getStatementList(parent)
  let previous = list && holder.index ? list[holder.index - 1] : null
  if (previous?.type !== 'IfStatement' || previous.alternate) {
    return null
  }
  let other = getReturnedValue(previous.consequent)
  return other ?
      { test: unwrapParentheses(previous.test), forced: true, other }
    : null
}

/**
 * Finds the `return` statement that directly follows a statement in its list.
 *
 * @param node - Statement of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The next statement when it is a `return`, otherwise null.
 */
function getNextReturn(node: Node, context: MutatorContext): Node | null {
  let list = context.syntax.getStatementList(node)
  let { index } = context.sourceCode.getSlot(node)
  let next = list?.[index! + 1]
  return next?.type === 'ReturnStatement' ? next : null
}
