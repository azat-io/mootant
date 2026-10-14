import type { TemplateLiteral, StringLiteral, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Replacement } from '../../types/replacement'
import type { Mutator } from '../../types/mutator'

import { isNoOpCallbackLiteral } from './shared/is-no-op-callback-literal'
import { isBooleanModeOperand } from './shared/is-boolean-mode-operand'
import { isBranchCopySkipped } from './shared/is-branch-copy-skipped'
import { isComparisonOperand } from './shared/is-comparison-operand'
import { isOrDefaultSkipped } from './shared/is-or-default-skipped'
import { createRunContext } from './shared/create-run-context'
import { isLookupPosition } from './shared/is-lookup-position'
import { isVoidOperand } from './shared/is-void-operand'

/**
 * Options of the string-literal mutator.
 */
interface StringLiteralOptions {
  /**
   * Whether strings in `case` labels are mutated.
   */
  caseTests: boolean
}

/**
 * Text written into an empty string or template.
 */
const FILLER = 'mootant'

/**
 * Methods whose first argument is a lookup key.
 */
let lookupMethods = new Set([
  'hasOwnProperty',
  'getAttribute',
  'hasAttribute',
  'lastIndexOf',
  'startsWith',
  'endsWith',
  'includes',
  'contains',
  'indexOf',
  'getItem',
  'has',
  'get',
])

/**
 * Empties a string or the static text of a template literal, or fills an empty
 * one (catalog 4.16, T8). Keys, comparison, boolean-mode and `void` operands,
 * `Symbol` descriptions, error messages, lookup keys whose call is only tested,
 * JSX attribute strings, bare string statements, tagged templates, templates
 * without static text and (unless the `caseTests` option is set) case labels
 * are skipped, and so are mutants that another mutant owns or subsumes (branch
 * pairs, no-op callbacks, emptied `||` defaults).
 */
export let stringLiteral: Mutator<StringLiteralOptions> = {
  create(context) {
    let { sourceCode } = context
    return {
      TemplateLiteral(node) {
        let { expressions, quasis } = node
        if (sourceCode.getSlot(node).key === 'quasi') {
          return []
        }
        let hasText = quasis.some(quasi => quasi.value.cooked !== '')
        if (expressions.length === 0) {
          let value = hasText ? '' : FILLER
          return mutateString(node, { text: `\`${value}\``, value }, context)
        }
        if (!hasText) {
          return []
        }
        let parts = expressions.map(
          expression => `\${${sourceCode.getText(expression)}}`,
        )
        return mutateString(
          node,
          { text: `\`${parts.join('')}\``, value: null },
          context,
        )
      },
      Literal(node) {
        if (typeof node.value !== 'string') {
          return []
        }
        let quote = sourceCode.text[node.start]!
        let value = node.value === '' ? FILLER : ''
        return mutateString(
          node,
          { text: `${quote}${value}${quote}`, value },
          context,
        )
      },
    }
  },
  meta: {
    description:
      'Empties a string or the static text of a template literal, or fills an empty one.',
    defaultOptions: { caseTests: false },
  },
}

/**
 * New text of a string mutant and the value it stands for.
 */
interface StringChange {
  /**
   * New string value, or null for a template that keeps its expressions.
   */
  value: string | null

  /**
   * Replacement text.
   */
  text: string
}

/**
 * Builds the mutant of a string, or nothing when a rule of catalog 4.16 skips
 * it.
 *
 * @param node - String literal or template literal.
 * @param change - New text and value.
 * @param context - Mutator context of the file.
 * @returns The mutant, or nothing.
 */
function mutateString(
  node: TemplateLiteral | StringLiteral,
  change: StringChange,
  context: MutatorContext<StringLiteralOptions>,
): Replacement[] {
  let { options, syntax } = context
  let runContext = createRunContext(context)
  let { parent, key } = syntax.getContextSlot(node)
  let { value, text } = change
  if (
    key === 'key' ||
    (parent?.type === 'SwitchCase' && !options.caseTests) ||
    parent?.type === 'ExpressionStatement' ||
    parent?.type === 'JSXAttribute' ||
    (parent?.type === 'CallExpression' &&
      isSymbolCall(parent.callee, context)) ||
    isComparisonOperand(node, context) ||
    isBooleanModeOperand(node, context) ||
    isVoidOperand(node, context) ||
    syntax.isErrorMessage(node)
  ) {
    return []
  }
  if (value === null) {
    return isBranchCopySkipped(node, { text }, runContext) ?
        []
      : [{ text, node }]
  }
  if (
    (value === '' && isTestedLookupKey(node, context)) ||
    isBranchCopySkipped(node, { value }, runContext) ||
    isNoOpCallbackLiteral(node, value, context) ||
    isOrDefaultSkipped(node, value, runContext)
  ) {
    return []
  }
  return [{ text, node }]
}

/**
 * Tells whether a string is a lookup key whose emptiness only makes the lookup
 * constant where the call's value is tested (catalog 4.16 and 5.2, O8): the
 * first argument of a lookup method, or the second argument of `Object.hasOwn`,
 * when the call is in a boolean context, a boolean-mode or comparison operand,
 * a boolean result or the source of a local that a boolean result returns. The
 * owner of that position already makes the decision constant.
 *
 * @param node - String that would be emptied.
 * @param context - Mutator context of the file.
 * @returns Whether the empty key belongs to the owner of the position.
 */
function isTestedLookupKey(node: Node, context: MutatorContext): boolean {
  let { syntax } = context
  let { parent: call, index } = syntax.getContextSlot(node)
  if (call?.type !== 'CallExpression') {
    return false
  }
  let path = syntax.getMemberPath(call.callee)
  let callee = syntax.unwrapExpression(call.callee)
  let isKey =
    (index === 0 &&
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      lookupMethods.has(callee.property.name)) ||
    (index === 1 && path?.join('.') === 'Object.hasOwn')
  return isKey && isLookupPosition(call, context)
}

/**
 * Tells whether a callee is the identifier `Symbol`, whose argument is only a
 * description (catalog 4.16, NOISE).
 *
 * @param callee - Callee of a call.
 * @param context - Mutator context of the file.
 * @returns Whether the call creates a symbol.
 */
function isSymbolCall(callee: Node, context: MutatorContext): boolean {
  let inner = context.syntax.unwrapExpression(callee)
  return inner.type === 'Identifier' && inner.name === 'Symbol'
}
