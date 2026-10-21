import type { Node } from 'oxc-parser'

import type { AnalyzedProgram } from '../../types/syntax/analyzed-program'
import type { SyntaxHelpers } from '../../types/syntax/syntax-helpers'
import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { ValueBounds } from '../../types/syntax/value-bounds'
import type { LoggingCall } from '../../types/syntax/logging-call'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getEnclosingFunction } from './get-enclosing-function'
import { unwrapParentheses } from '../tree/unwrap-parentheses'
import { getNamedGroupsFact } from './get-named-groups-fact'
import { unwrapExpression } from '../tree/unwrap-expression'
import { isLoopAdvanceValue } from './is-loop-advance-value'
import { getNeverFalsyFact } from './get-never-falsy-fact'
import { getContextSlot } from '../tree/get-context-slot'
import { isGlobalTypeName } from './is-global-type-name'
import { getTruthOnlyName } from './get-truth-only-name'
import { isInsideTryBlock } from './is-inside-try-block'
import { isBooleanContext } from './is-boolean-context'
import { isLogicalOperand } from './is-logical-operand'
import { getStatementList } from './get-statement-list'
import { solveValueBounds } from './solve-value-bounds'
import { isConditionTest } from './is-condition-test'
import { isValuePosition } from './is-value-position'
import { getLogicalChain } from './get-logical-chain'
import { isErrorMessage } from './is-error-message'
import { isResultUnused } from './is-result-unused'
import { getExitedLoops } from './get-exited-loops'
import { isNonThenable } from './is-non-thenable'
import { isJoinedArray } from './is-joined-array'
import { getValueBound } from './get-value-bound'
import { getLowerBound } from './get-lower-bound'
import { isPropertyKey } from './is-property-key'
import { getMemberPath } from './get-member-path'
import { isLoggingCall } from './is-logging-call'
import { readTimerCall } from './read-timer-call'
import { isGlobalName } from './is-global-name'
import { isLogMessage } from './is-log-message'
import { isTimerDelay } from './is-timer-delay'
import { getChainRoot } from './get-chain-root'
import { advancesLoop } from './advances-loop'
import { isLoopTest } from './is-loop-test'

/**
 * What the syntax predicates of a program need besides its tree and scopes.
 */
interface SyntaxHelperOptions {
  /**
   * Logging calls of the program (see `findLoggingCalls`), whose message
   * mutants are skipped; none when omitted.
   */
  loggingCalls?: readonly LoggingCall[]

  /**
   * Scopes of the program whose names code outside them may read and write (see
   * `getSharedScopes`); none when omitted.
   */
  sharedScopes?: ReadonlySet<Node>

  /**
   * Arrow functions whose result nothing reads, such as the event handlers of a
   * component template; none when omitted.
   */
  discarded?: ReadonlySet<Node>

  /**
   * Names of the `loggers` setting, which tell logging calls; none when
   * omitted.
   */
  loggers?: readonly string[]
}

/**
 * Binds the syntax predicates to the runtime tree and the scope analysis of a
 * file, giving the `syntax` object of the mutator context. The bounds of the
 * names whose values change are found once, on the first question about a bound
 * or a never-falsy value (see `solveValueBounds`).
 *
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @param options - Discarded arrow functions, the logging calls and shared
 *   scopes of the program and the logger names of the settings.
 * @returns Questions about the syntactic position of nodes of the file.
 */
export function createSyntaxHelpers(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  options: SyntaxHelperOptions = {},
): SyntaxHelpers {
  let {
    sharedScopes = new Set(),
    discarded = new Set(),
    loggingCalls = [],
    loggers = [],
  } = options
  let program: AnalyzedProgram = { shared: sharedScopes, scopes, tree }
  let bounds: ValueBounds | null = null

  /**
   * Finds the bounds of the program on the first call. Should the fixed point
   * throw, the question that started it fails and later questions get bounds
   * that prove nothing about the names that change, without solving again.
   *
   * @returns Bounds of the names of the program whose values change.
   */
  function getBounds(): ValueBounds {
    if (!bounds) {
      bounds = {
        counters: new Map(),
        entries: new Map(),
        fixed: new Map(),
        maps: new Map(),
        cut: new Map(),
        ...program,
      }
      bounds = solveValueBounds(tree, scopes, sharedScopes)
    }
    return bounds
  }

  return {
    isLogMessage: node =>
      isLogMessage(loggingCalls, node, node.type === 'ExpressionStatement'),
    getNeverFalsyFact: node => getNeverFalsyFact(getBounds(), node),
    isBooleanContext: node => isBooleanContext(tree, scopes, node),
    getEnclosingFunction: node => getEnclosingFunction(tree, node),
    getNamedGroupsFact: node => getNamedGroupsFact(program, node),
    isResultUnused: node => isResultUnused(tree, node, discarded),
    isLoopAdvanceValue: node => isLoopAdvanceValue(tree, node),
    getTruthOnlyName: node => getTruthOnlyName(program, node),
    isGlobalTypeName: node => isGlobalTypeName(program, node),
    getValueBound: node => getValueBound(getBounds(), node),
    getLowerBound: node => getLowerBound(getBounds(), node),
    isTimerDelay: node => isTimerDelay(tree, scopes, node),
    getStatementList: node => getStatementList(tree, node),
    isLogicalOperand: node => isLogicalOperand(tree, node),
    isInsideTryBlock: node => isInsideTryBlock(tree, node),
    isConditionTest: node => isConditionTest(tree, node),
    isValuePosition: node => isValuePosition(tree, node),
    isJoinedArray: node => isJoinedArray(program, node),
    isLoggingCall: node => isLoggingCall(node, loggers),
    readTimerCall: node => readTimerCall(scopes, node),
    getContextSlot: node => getContextSlot(tree, node),
    isErrorMessage: node => isErrorMessage(tree, node),
    getExitedLoops: node => getExitedLoops(tree, node),
    isNonThenable: node => isNonThenable(scopes, node),
    isGlobalName: name => isGlobalName(program, name),
    isPropertyKey: node => isPropertyKey(tree, node),
    getChainRoot: node => getChainRoot(tree, node),
    advancesLoop: node => advancesLoop(tree, node),
    isRuntimeNode: node => tree.slots.has(node),
    isLoopTest: node => isLoopTest(tree, node),
    unwrapParentheses,
    unwrapExpression,
    getLogicalChain,
    getMemberPath,
  }
}
