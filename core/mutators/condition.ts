import type { ForStatement, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { RunContext } from './shared/create-run-context'
import type { Mutator } from '../../types/mutator/mutator'

import { getConditionConstants } from './shared/get-condition-constants'
import { createRunContext } from './shared/create-run-context'
import { isNegation } from './shared/is-negation'

/**
 * Forces a condition that is not a logical expression to true or false.
 */
export let condition: Mutator = {
  create(context) {
    let runContext = createRunContext(context)

    /**
     * Forces the test of a statement or a conditional expression (catalog 4.7):
     * the test without its parentheses gets `true` and `false`, minus the
     * constants that other mutators own and the skipped ones, which follow as
     * skipped replacements.
     *
     * @param test - Test of the statement or the conditional expression.
     * @returns Replacements of the test.
     */
    function forceTest(test: Node): Replacement[] {
      return getConstants(context.syntax.unwrapParentheses(test), runContext)
    }

    return {
      UnaryExpression(node) {
        if (
          !isNegation(node) ||
          context.syntax.isConditionTest(node) ||
          context.syntax.isLoopTest(node)
        ) {
          return []
        }
        return getConstants(node, runContext)
      },
      ForStatement(node) {
        if (node.test) {
          return forceTest(node.test)
        }
        return [getNeverRunLoop(node, context)]
      },
      ConditionalExpression: node => forceTest(node.test),
      DoWhileStatement: node => forceTest(node.test),
      WhileStatement: node => forceTest(node.test),
      IfStatement: node => forceTest(node.test),
    }
  },
  meta: {
    description:
      'Forces a condition that is not a logical expression to true or false.',
  },
}

/**
 * Builds the never-run mutant of a `for` without a test (catalog 4.7): `false`
 * is inserted right after the first `;` of the header. The replaced node is the
 * statement, or the outermost labeled statement around it, so that a `continue`
 * with the label stays valid inside the host.
 *
 * @param node - `for` statement without a test.
 * @param context - Mutator context of the file.
 * @returns Replacement of the statement or its labeled statement.
 */
function getNeverRunLoop(
  node: ForStatement,
  context: MutatorContext,
): Replacement {
  let { sourceCode } = context
  let semicolon = sourceCode.findTokenStart(
    node.init ? node.init.end : node.start + 3,
    node.end,
  )
  let host: Node = node
  let parent = sourceCode.getParent(host)
  while (parent?.type === 'LabeledStatement') {
    host = parent
    parent = sourceCode.getParent(host)
  }
  return {
    text: sourceCode.editText(host, [
      { start: semicolon + 1, end: semicolon + 1, text: 'false' },
    ]),
    node: host,
  }
}

/**
 * Builds the constants condition emits on its replaced node (catalog 4.7): a
 * test without parentheses or a value negation.
 *
 * @param node - Replaced node.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Replacements of the node, `true` first, then the skipped ones.
 */
function getConstants(node: Node, context: RunContext): Replacement[] {
  let { skipped, values } = getConditionConstants(node, context)
  return [...values.map(value => ({ text: String(value), node })), ...skipped]
}
