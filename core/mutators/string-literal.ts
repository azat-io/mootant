import type { TemplateLiteral, StringLiteral, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { readRegexArgument } from '../regex/read-regex-argument'
import { createRunContext } from './shared/create-run-context'
import { isLookupPosition } from './shared/is-lookup-position'
import { getLiteralSkip } from './shared/get-literal-skip'
import { readRegexCall } from '../regex/read-regex-call'

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
 * JSX attribute strings, the pattern and flags of `RegExp` calls the regex
 * mutators read, bare string statements, tagged templates, templates without
 * static text and (unless the `caseTests` option is set) case labels are
 * skipped, and so are mutants that another mutant owns or subsumes (branch
 * pairs, no-op callbacks, emptied `||` defaults). A skipped change follows as a
 * skipped replacement; a template without static text has nothing to change.
 */
export let stringLiteral: Mutator<StringLiteralOptions> = {
  create(context) {
    let { sourceCode } = context
    return {
      TemplateLiteral(node) {
        let { expressions, quasis } = node
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
 * Decides whether string-literal skips the change of a string (catalog 4.16):
 * tagged templates, keys, case labels unless the `caseTests` option is set,
 * bare string statements, JSX attribute strings, `Symbol` descriptions, the
 * arguments of `RegExp` calls the regex mutators read, the rules all literal
 * mutators share, and an emptied lookup key whose call is only tested (O8).
 *
 * @param node - String literal or template literal.
 * @param change - New text and value.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getStringSkip(
  node: TemplateLiteral | StringLiteral,
  change: StringChange,
  context: MutatorContext<StringLiteralOptions>,
): SkipNote | null {
  let { sourceCode, options, syntax } = context
  let { parent, key } = syntax.getContextSlot(node)
  let { value, text } = change
  if (sourceCode.getSlot(node).key === 'quasi') {
    return {
      reason: 'the text of a tagged template belongs to its tag',
      rule: 'tagged-template',
    }
  }
  if (key === 'key') {
    return { reason: 'property keys are not mutated', rule: 'property-key' }
  }
  if (parent?.type === 'SwitchCase' && !options.caseTests) {
    return {
      reason: 'case labels are mutated only with the caseTests option',
      rule: 'case-label',
    }
  }
  if (parent?.type === 'ExpressionStatement') {
    return {
      reason: 'a bare string statement, such as a directive, is not mutated',
      rule: 'bare-string',
    }
  }
  if (parent?.type === 'JSXAttribute') {
    return {
      reason: 'a JSX attribute string is not worth a test',
      rule: 'jsx-attribute',
    }
  }
  if (
    parent?.type === 'CallExpression' &&
    isSymbolCall(parent.callee, context)
  ) {
    return {
      reason: 'the description of a symbol is not worth a test',
      rule: 'symbol-description',
    }
  }
  let regexSkip = getRegexArgumentSkip(node, context)
  if (regexSkip) {
    return regexSkip
  }
  let runContext = createRunContext(context)
  if (value === null) {
    return getLiteralSkip(node, { change: { text } }, runContext)
  }

  /**
   * Skips an emptied lookup key whose call is only tested (O8).
   *
   * @returns Rule and reason of the skip, or null.
   */
  function getOwnSkip(): SkipNote | null {
    if (value === '' && isTestedLookupKey(node, context)) {
      return {
        reason:
          'an empty lookup key only makes a tested lookup constant, which the owner of the test emits',
        rule: 'O8',
      }
    }
    return null
  }
  return getLiteralSkip(node, { change: { value }, getOwnSkip }, runContext)
}

/**
 * Skips the pattern and the flags of a call of `RegExp` that the regex mutators
 * read (catalog 4.16): an emptied pattern matches everything, which the mutants
 * of the conditions that test the match already cover, and the flags of a known
 * pattern belong to regex-flag when it runs (catalog 2.7). A template pattern
 * with expressions stays mutated: emptying it keeps the expressions, so the
 * pattern is not empty and regex-pattern changes only its edge anchors. The
 * flags of such a template, whose flags regex-flag does not change, stay
 * mutated too.
 *
 * @param node - String literal or template literal.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null.
 */
function getRegexArgumentSkip(
  node: TemplateLiteral | StringLiteral,
  context: MutatorContext,
): SkipNote | null {
  let { parent, index, key } = context.syntax.getContextSlot(node)
  let call =
    key === 'arguments' && parent ? readRegexCall(parent, context) : null
  if (call === null) {
    return null
  }
  if (index === 0) {
    if (node.type === 'TemplateLiteral' && node.expressions.length > 0) {
      return null
    }
    return {
      reason:
        'an empty RegExp pattern matches everything, which the conditions that test the match cover',
      rule: 'regex-argument',
    }
  }
  let source = readRegexArgument(call, context.sourceCode.text)
  let owner = { mutator: 'regex-flag', node: call.flagsNode! }
  if (
    source &&
    !source.dynamic &&
    createRunContext(context).runs(owner, { mutator: 'string-literal', node })
  ) {
    return {
      reason: 'regex-flag changes the flags of RegExp',
      rule: 'regex-argument',
    }
  }
  return null
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
 * Builds the mutant of a string, skipped when a rule of catalog 4.16 applies.
 *
 * @param node - String literal or template literal.
 * @param change - New text and value.
 * @param context - Mutator context of the file.
 * @returns The mutant or the skipped mutant.
 */
function mutateString(
  node: TemplateLiteral | StringLiteral,
  change: StringChange,
  context: MutatorContext<StringLiteralOptions>,
): Replacement[] {
  let { text } = change
  let skip = getStringSkip(node, change, context)
  return [skip ? { text, skip, node } : { text, node }]
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
