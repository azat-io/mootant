import type { Node } from 'oxc-parser'

import type { SyntaxHelpers } from '../../types/syntax/syntax-helpers'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getEnclosingFunction } from './get-enclosing-function'
import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { unwrapExpression } from '../tree/unwrap-expression'
import { isLoopAdvanceValue } from './is-loop-advance-value'
import { getContextSlot } from '../tree/get-context-slot'
import { isInsideTryBlock } from './is-inside-try-block'
import { isBooleanContext } from './is-boolean-context'
import { isLogicalOperand } from './is-logical-operand'
import { getStatementList } from './get-statement-list'
import { isConditionTest } from './is-condition-test'
import { isValuePosition } from './is-value-position'
import { getLogicalChain } from './get-logical-chain'
import { isErrorMessage } from './is-error-message'
import { isResultUnused } from './is-result-unused'
import { getExitedLoops } from './get-exited-loops'
import { getLowerBound } from './get-lower-bound'
import { isPropertyKey } from './is-property-key'
import { getMemberPath } from './get-member-path'
import { isLoggingCall } from './is-logging-call'
import { getChainRoot } from './get-chain-root'
import { advancesLoop } from './advances-loop'
import { isLoopTest } from './is-loop-test'

/**
 * Binds the syntax predicates to the runtime tree and the scope analysis of a
 * file, giving the `syntax` object of the mutator context.
 *
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @param discarded - Arrow functions whose result nothing reads, such as the
 *   event handlers of a component template; none when omitted.
 * @returns Questions about the syntactic position of nodes of the file.
 */
export function createSyntaxHelpers(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  discarded: ReadonlySet<Node> = new Set(),
): SyntaxHelpers {
  return {
    isBooleanContext: node => isBooleanContext(tree, scopes, node),
    getEnclosingFunction: node => getEnclosingFunction(tree, node),
    isResultUnused: node => isResultUnused(tree, node, discarded),
    isLoopAdvanceValue: node => isLoopAdvanceValue(tree, node),
    getStatementList: node => getStatementList(tree, node),
    isLogicalOperand: node => isLogicalOperand(tree, node),
    isInsideTryBlock: node => isInsideTryBlock(tree, node),
    isConditionTest: node => isConditionTest(tree, node),
    isValuePosition: node => isValuePosition(tree, node),
    getLowerBound: node => getLowerBound(scopes, node),
    getContextSlot: node => getContextSlot(tree, node),
    isErrorMessage: node => isErrorMessage(tree, node),
    getExitedLoops: node => getExitedLoops(tree, node),
    isPropertyKey: node => isPropertyKey(tree, node),
    getChainRoot: node => getChainRoot(tree, node),
    advancesLoop: node => advancesLoop(tree, node),
    isRuntimeNode: node => tree.slots.has(node),
    isLoopTest: node => isLoopTest(tree, node),
    unwrapParentheses,
    unwrapExpression,
    getLogicalChain,
    getMemberPath,
    isLoggingCall,
  }
}
