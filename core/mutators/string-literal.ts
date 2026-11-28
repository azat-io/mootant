import type {
  JSXOpeningElement,
  TemplateLiteral,
  StringLiteral,
  JSXAttribute,
  Node,
} from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { CoreNote } from '../../types/mutant/core-note'
import type { Mutator } from '../../types/mutator/mutator'

import { isBraceSensitiveAttribute } from '../syntax/is-brace-sensitive-attribute'
import { isPlainAttributeString } from '../text/is-plain-attribute-string'
import { readRegexArgument } from '../regex/read-regex-argument'
import { createRunContext } from './shared/create-run-context'
import { isLookupPosition } from './shared/is-lookup-position'
import { getLiteralSkip } from './shared/get-literal-skip'
import { readRegexCall } from '../regex/read-regex-call'
import { isReadChain } from '../syntax/is-read-chain'

/**
 * Options of the string-literal mutator.
 */
interface StringLiteralOptions {
  /**
   * Whether quoted JSX attribute values are mutated, apart from those of
   * `className`, `class`, `style` and `data-testid`, those of attributes whose
   * meaning braces would change, such as `disabled` and `onclick` (see
   * `isBraceSensitiveAttribute`), and those with a backslash, a control
   * character or a character reference.
   */
  jsxAttributes: boolean

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
 * What the quoted values of these JSX attributes change, by attribute name. The
 * `jsxAttributes` option leaves them alone: a class or a style only changes how
 * an element looks, and a test id only how a test finds it.
 */
let skippedAttributes = new Map([
  ['data-testid', 'test id'],
  ['className', 'class'],
  ['class', 'class'],
  ['style', 'style'],
])

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
 * one (catalog 4.16, T8). A template whose expressions are all plain reads
 * (`a`, `a.b`, `a?.b`, `a[0]`, `this.x`) becomes `''`, since its expressions
 * glued together are rarely a value of their own; other expressions are kept,
 * and so are those of a tagged template, which a string cannot replace. Keys,
 * comparison, boolean-mode and `void` operands, `Symbol` descriptions, error
 * messages, lookup keys whose call is only tested, quoted JSX attribute values
 * (with the `jsxAttributes` option, only those of `className`, `class`, `style`
 * and `data-testid` and those whose meaning braces would change), the pattern
 * and flags of `RegExp` calls the regex mutators read, bare string statements,
 * tagged templates, templates without static text and (unless the `caseTests`
 * option is set) case labels are skipped, and so are mutants that another
 * mutant owns or subsumes (branch pairs, no-op callbacks, emptied `||`
 * defaults). A skipped change follows as a skipped replacement; a template
 * without static text has nothing to change.
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
        if (
          expressions.every(isReadChain) &&
          sourceCode.getSlot(node).key !== 'quasi'
        ) {
          return mutateString(node, { value: null, text: "''" }, context)
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
    defaultOptions: { jsxAttributes: false, caseTests: false },
  },
}

/**
 * New text of a string mutant and the value it stands for.
 */
interface StringChange {
  /**
   * New string value, or null for a template with expressions, whose change is
   * judged by its text.
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
 * bare string statements, quoted JSX attribute values (see `getAttributeSkip`),
 * `Symbol` descriptions, the arguments of `RegExp` calls the regex mutators
 * read, the rules all literal mutators share, and an emptied lookup key whose
 * call is only tested (O8).
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
): CoreNote | null {
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
  let attributeSkip =
    parent?.type === 'JSXAttribute' ?
      getAttributeSkip(parent, node, context)
    : null
  if (attributeSkip) {
    return attributeSkip
  }
  if (
    parent?.type === 'CallExpression' &&
    isSymbolCall(parent.callee, context)
  ) {
    return {
      reason: 'it only changes the description of a symbol',
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
  function getOwnSkip(): CoreNote | null {
    if (value === '' && isTestedLookupKey(node, context)) {
      return {
        reason:
          'an empty lookup key only makes a tested lookup constant, as another mutator does',
        rule: 'O8',
      }
    }
    return null
  }
  return getLiteralSkip(node, { change: { value }, getOwnSkip }, runContext)
}

/**
 * Decides whether string-literal skips the change of a quoted JSX attribute
 * value. Without the `jsxAttributes` option it skips every one. With the option
 * it skips the values of `className`, `class`, `style` and `data-testid`, by a
 * guess from the name that they only change how an element looks or how a test
 * finds it, and the values whose meaning the mutant switch would change by
 * moving them into braces: those a compiler may then read another way (see
 * `isBraceSensitiveAttribute`), a guess about the compiler that reads the file,
 * and those whose text JSX and JavaScript read differently (see
 * `isPlainAttributeString`).
 *
 * @param attribute - Attribute whose value the change replaces.
 * @param node - Quoted value of the attribute.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the value is mutated.
 */
function getAttributeSkip(
  attribute: JSXAttribute,
  node: TemplateLiteral | StringLiteral,
  context: MutatorContext<StringLiteralOptions>,
): CoreNote | null {
  if (!context.options.jsxAttributes) {
    return {
      reason: 'it only changes the quoted value of a JSX attribute',
      rule: 'jsx-attribute',
    }
  }
  let { name } = attribute
  let part =
    name.type === 'JSXIdentifier' ? skippedAttributes.get(name.name) : undefined
  if (part !== undefined) {
    return {
      reason: `it only changes the ${part} of an element`,
      rule: 'jsx-attribute',
      heuristic: true,
    }
  }
  let element = context.sourceCode.getParent(attribute) as JSXOpeningElement
  if (isBraceSensitiveAttribute(attribute, element)) {
    return {
      reason:
        "Mootant cannot switch a mutant on for a quoted JSX attribute value that a compiler such as Solid's reads another way once it is in braces",
      rule: 'invalid-target',
      heuristic: true,
    }
  }
  if (!isPlainAttributeString(context.sourceCode.getText(node))) {
    return {
      reason:
        'Mootant cannot switch a mutant on for a quoted JSX attribute value with a backslash, a control character such as a line break, or a character reference',
      rule: 'invalid-target',
    }
  }
  return null
}

/**
 * Skips the pattern and the flags of a call of `RegExp` that the regex mutators
 * read (catalog 4.16): an emptied pattern matches everything, which the mutants
 * of the conditions that test the match already cover, and the flags of a known
 * pattern belong to regex-flag when it runs (catalog 2.7). A template pattern
 * with an expression other than a plain read stays mutated: emptying it keeps
 * the expressions, so the pattern is not empty and regex-pattern changes only
 * its edge anchors. The flags of such a template, whose flags regex-flag does
 * not change, stay mutated too.
 *
 * @param node - String literal or template literal.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null.
 */
function getRegexArgumentSkip(
  node: TemplateLiteral | StringLiteral,
  context: MutatorContext,
): CoreNote | null {
  let { parent, index, key } = context.syntax.getContextSlot(node)
  let call =
    key === 'arguments' && parent ? readRegexCall(parent, context) : null
  if (call === null) {
    return null
  }
  if (index === 0) {
    if (
      node.type === 'TemplateLiteral' &&
      !node.expressions.every(isReadChain)
    ) {
      return null
    }
    return {
      reason:
        'an empty RegExp pattern matches everything, which acts like a test of the match forced to true',
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
