import type { StaticMemberExpression, CallExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Replacement } from '../../types/replacement'
import type { SkipNote } from '../../types/skip-note'
import type { TextEdit } from '../../types/text-edit'
import type { Mutator } from '../../types/mutator'

import { isLookupPosition } from './shared/is-lookup-position'
import { getLiteralValue } from './shared/get-literal-value'
import { getTypeView } from './shared/get-type-view'
import { getCallTop } from './shared/get-call-top'

/**
 * What the mutator does with a call of one method name.
 */
interface MethodRule {
  /**
   * Receiver types the rule applies to, or null for the global `Math`.
   */
  receivers: readonly string[] | null

  /**
   * Method name written in place of the original, or null when the call is
   * replaced by its receiver.
   */
  partner: string | null
}

/**
 * Options of the method-call mutator.
 */
interface MethodCallOptions {
  /**
   * Whether calls are mutated on receivers of any known type.
   */
  anyReceiver: boolean
}

/**
 * Call whose callee is a non-computed member with a plain name.
 */
type MethodCall = { callee: StaticMemberExpression } & CallExpression

/**
 * Receiver types of string methods.
 */
let stringReceivers = ['string']

/**
 * Receiver types of array methods.
 */
let arrayReceivers = ['array']

/**
 * Rules of the table of catalog 4.9, by method name.
 */
let rules = new Map<string, MethodRule>([
  [
    'toLocaleLowerCase',
    { partner: 'toLocaleUpperCase', receivers: stringReceivers },
  ],
  [
    'toLocaleUpperCase',
    { partner: 'toLocaleLowerCase', receivers: stringReceivers },
  ],
  ['toLowerCase', { receivers: stringReceivers, partner: 'toUpperCase' }],
  ['toUpperCase', { receivers: stringReceivers, partner: 'toLowerCase' }],
  ['startsWith', { receivers: stringReceivers, partner: 'endsWith' }],
  ['endsWith', { receivers: stringReceivers, partner: 'startsWith' }],
  ['trimStart', { receivers: stringReceivers, partner: 'trimEnd' }],
  ['trimEnd', { receivers: stringReceivers, partner: 'trimStart' }],
  ['padStart', { receivers: stringReceivers, partner: 'padEnd' }],
  ['padEnd', { receivers: stringReceivers, partner: 'padStart' }],
  ['slice', { receivers: ['string', 'array'], partner: null }],
  ['substring', { receivers: stringReceivers, partner: null }],
  ['toReversed', { receivers: arrayReceivers, partner: null }],
  ['toSorted', { receivers: arrayReceivers, partner: null }],
  ['every', { receivers: arrayReceivers, partner: 'some' }],
  ['some', { receivers: arrayReceivers, partner: 'every' }],
  ['substr', { receivers: stringReceivers, partner: null }],
  ['charAt', { receivers: stringReceivers, partner: null }],
  ['reverse', { receivers: arrayReceivers, partner: null }],
  ['filter', { receivers: arrayReceivers, partner: null }],
  ['trim', { receivers: stringReceivers, partner: null }],
  ['sort', { receivers: arrayReceivers, partner: null }],
  ['floor', { partner: 'ceil', receivers: null }],
  ['ceil', { partner: 'floor', receivers: null }],
  ['max', { receivers: null, partner: 'min' }],
  ['min', { receivers: null, partner: 'max' }],
])

/**
 * Methods whose swap keeps the truthiness and the length of the result: the pad
 * swaps. A case swap can change the length (`'ß'.toUpperCase()` is `'SS'`).
 */
let lengthKeepingMethods = new Set(['padStart', 'padEnd'])

/**
 * Methods whose swap keeps the truthiness of the result.
 */
let truthKeepingMethods = new Set([
  ...lengthKeepingMethods,
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLowerCase',
  'toUpperCase',
  'trimStart',
  'trimEnd',
])

/**
 * Methods that change the letter case of a string.
 */
let caseMethods = new Set([
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'toLowerCase',
  'toUpperCase',
])

/**
 * Methods that search a string for their first argument and return only whether
 * they found it. Their result, called without a position, does not see lengths
 * or positions, which a case swap can shift (`'ß!'.toUpperCase()` is `'SS!'`).
 */
let lookupMethods = new Set(['startsWith', 'includes', 'endsWith'])

/**
 * Equality operators of catalog O17.
 */
let equalityOperators = new Set(['===', '!==', '==', '!='])

/**
 * Methods whose call with a start of `0` can return the receiver's contents.
 */
let identityMethods = new Set(['substring', 'substr', 'slice'])

/**
 * Swaps a method with its opposite (startsWith/endsWith, min/max, ...) or
 * removes a transforming call (trim, filter, sort, ...), as catalog 4.9 states:
 * the receiver gate, the equivalent case, pad and trim swaps, the identities of
 * `slice`, `substring` and `substr`, and the case swaps decided by a literal
 * (O17). A call that an optional link at or below it can skip is replaced
 * through its chain root, with the change as edits inside the root's text
 * (T10). Skipped mutants follow as skipped replacements.
 */
export let methodCall: Mutator<MethodCallOptions> = {
  meta: {
    description:
      'Swaps a method with its opposite (startsWith/endsWith, min/max, ...) or removes a transforming call (trim, filter, sort, ...).',
    defaultOptions: { anyReceiver: false },
  },
  create(context) {
    return {
      CallExpression(node) {
        return isMethodCall(node) ? getReplacements(node, context) : []
      },
    }
  },
}

/**
 * Decides whether the mutant of a call is skipped: a removal on a `super`
 * receiver, which leaves no expression, or of an identity call, a case, pad or
 * trim swap whose result is only used for its truthiness or length (EQ), and a
 * case swap decided by a literal (O17).
 *
 * @param call - Method call.
 * @param rule - Rule of the method name.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getEquivalentSkip(
  call: MethodCall,
  rule: MethodRule,
  context: MutatorContext,
): SkipNote | null {
  let { name } = call.callee.property
  if (rule.partner === null) {
    if (call.callee.object.type === 'Super') {
      return {
        reason: 'super alone is not an expression',
        rule: 'invalid-target',
      }
    }
    return isIdentityCall(call, context) ?
        {
          reason: `this ${name} call returns the receiver's contents`,
          rule: 'identity-call',
        }
      : null
  }
  let top = getCallTop(call, context)
  if (truthKeepingMethods.has(name) && context.syntax.isBooleanContext(top)) {
    return {
      reason: `only the truth of the result is used, which ${name} and ${rule.partner} share`,
      rule: 'truth-keeping-swap',
    }
  }
  if (lengthKeepingMethods.has(name) && isLengthObject(top, context)) {
    return {
      reason: `only the length of the result is used, which ${name} and ${rule.partner} share`,
      rule: 'length-keeping-swap',
    }
  }
  if (caseMethods.has(name) && isDecidedByLiteral(top, name, context)) {
    return {
      reason:
        'the swapped call is compared with a literal it never matches or both match alike, so the decision is constant or unchanged',
      rule: 'O17',
    }
  }
  return null
}

/**
 * Tells whether a call returns the receiver's contents (catalog 4.9,
 * identities): `slice()`, `slice(0)`, `substring(0)`, `substr(0)`, and
 * `slice(0, x)`, `substring(0, x)` and `substr(0, x)` with `x` the global
 * `undefined` or the receiver's own `.length`; `substring()` and `substr()`
 * without arguments as well. `slice` counts only on a receiver known to be a
 * string: on an array it makes a copy, and removing the copy shares the
 * receiver, which a later in-place change or an identity check can tell.
 *
 * @param call - Method call.
 * @param context - Mutator context of the file.
 * @returns Whether removing the call changes nothing observable.
 */
function isIdentityCall(call: MethodCall, context: MutatorContext): boolean {
  let { sourceCode, syntax } = context
  let { name } = call.callee.property
  let [start, end, ...rest] = call.arguments
  if (
    !identityMethods.has(name) ||
    (name === 'slice' &&
      getTypeView(context.hints.getType(call.callee.object)).type !== 'string')
  ) {
    return false
  }
  if (!start) {
    return true
  }
  if (rest.length > 0 || getLiteralValue(start) !== 0) {
    return false
  }
  if (!end) {
    return true
  }
  let inner = syntax.unwrapParentheses(end)
  if (inner.type === 'Identifier') {
    return inner.name === 'undefined' && sourceCode.getBinding(inner) === null
  }
  return (
    inner.type === 'MemberExpression' &&
    !inner.computed &&
    inner.property.name === 'length' &&
    sourceCode.getText(syntax.unwrapParentheses(inner.object)) ===
      sourceCode.getText(syntax.unwrapParentheses(call.callee.object))
  )
}

/**
 * Builds the edits that remove a call and keep its receiver (catalog 4.9, T10).
 * When the removed part carried the chain's optional link, the link moves to
 * the first element above the call: past non-null assertions, a non-computed
 * member's `.` becomes `?.`, and `?.` is inserted before a computed member or a
 * call. An element that is already optional keeps its link, and a call that
 * ends the chain drops it.
 *
 * @param call - Method call being removed.
 * @param context - Mutator context of the file.
 * @returns The edits, inside the replaced node.
 */
function getRemovalEdits(
  call: MethodCall,
  context: MutatorContext,
): TextEdit[] {
  let { sourceCode } = context
  let edits: TextEdit[] = [
    { start: call.callee.object.end, end: call.end, text: '' },
  ]
  if (!call.optional && !call.callee.optional) {
    return edits
  }
  let current: Node = call
  let { parent } = sourceCode.getSlot(current)
  while (parent?.type === 'TSNonNullExpression') {
    current = parent
    ;({ parent } = sourceCode.getSlot(current))
  }
  if (
    (parent?.type !== 'MemberExpression' &&
      parent?.type !== 'CallExpression') ||
    parent.optional
  ) {
    return edits
  }
  if (parent.type === 'MemberExpression' && !parent.computed) {
    let dot = sourceCode.findTokenStart(current.end, parent.property.start)
    return [...edits, { end: dot + 1, start: dot, text: '?.' }]
  }
  return [...edits, { start: current.end, end: current.end, text: '?.' }]
}

/**
 * Tells whether a case swap makes a decision constant or changes nothing
 * (catalog 4.9, O17): the value is compared by equality with, or searched by
 * `includes`, `startsWith` or `endsWith` without a position argument in a
 * lookup position for, a string literal that the original method leaves
 * unchanged. `indexOf`, `search`, `slice` and the other calls that see
 * positions keep the swap, since it can change the length of the value.
 *
 * @param node - Value of the case call.
 * @param name - Name of the case method.
 * @param context - Mutator context of the file.
 * @returns Whether the swap is skipped.
 */
function isDecidedByLiteral(
  node: Node,
  name: string,
  context: MutatorContext,
): boolean {
  let { sourceCode, syntax } = context
  let lower = name.includes('Lower')
  let { parent, key } = syntax.getContextSlot(node)
  if (parent?.type === 'BinaryExpression') {
    return (
      equalityOperators.has(parent.operator) &&
      isCaseless(key === 'left' ? parent.right : parent.left, lower)
    )
  }
  if (
    parent?.type !== 'MemberExpression' ||
    parent.computed ||
    !lookupMethods.has(parent.property.name)
  ) {
    return false
  }
  let { parent: lookup, key: lookupKey } = sourceCode.getSlot(parent)
  if (
    lookupKey !== 'callee' ||
    lookup?.type !== 'CallExpression' ||
    lookup.arguments.length !== 1 ||
    !isCaseless(lookup.arguments[0]!, lower)
  ) {
    return false
  }
  return isLookupPosition(lookup, context)
}

/**
 * Builds the mutant of a method call: the rename to the partner or the removal
 * of the call. A mutant that the receiver gate or a skip of catalog 4.9 rules
 * out, or whose node the mutant switch cannot wrap, follows as a skipped
 * replacement.
 *
 * @param call - Method call.
 * @param context - Mutator context of the file.
 * @returns The replacement, or none for a name outside the table.
 */
function getReplacements(
  call: MethodCall,
  context: MutatorContext<MethodCallOptions>,
): readonly Replacement[] {
  let rule = rules.get(call.callee.property.name)
  if (!rule) {
    return []
  }
  let target = getTarget(call, context)
  let wrapped = context.syntax.isValuePosition(target)
  let { property } = call.callee
  let edits =
    rule.partner === null ?
      getRemovalEdits(call, context)
    : [{ start: property.start, text: rule.partner, end: property.end }]
  let text = context.sourceCode.editText(target, edits)
  let skip: SkipNote | null =
    wrapped ?
      getSkip(call, rule, context)
    : {
        reason: 'the mutant switch cannot wrap the call in this position',
        rule: 'invalid-target',
      }
  return [skip ? { node: target, text, skip } : { node: target, text }]
}

/**
 * Tells whether the receiver of a call passes the gate of its rule (catalog
 * 4.9): the global `Math` for the `Math` methods, otherwise a receiver of the
 * rule's type or of unknown type. With `anyReceiver` every receiver passes.
 *
 * @param call - Method call.
 * @param rule - Rule of the method name.
 * @param context - Mutator context of the file.
 * @returns Whether the call is mutated.
 */
function acceptsReceiver(
  call: MethodCall,
  rule: MethodRule,
  context: MutatorContext<MethodCallOptions>,
): boolean {
  let { sourceCode, options, syntax, hints } = context
  if (options.anyReceiver) {
    return true
  }
  let receiver = call.callee.object
  if (rule.receivers === null) {
    let inner = syntax.unwrapParentheses(receiver)
    return (
      inner.type === 'Identifier' &&
      inner.name === 'Math' &&
      sourceCode.getBinding(inner) === null
    )
  }
  let { type } = getTypeView(hints.getType(receiver))
  return type === 'unknown' || rule.receivers.includes(type)
}

/**
 * Decides whether the mutant of a call is skipped: the receiver does not pass
 * the gate of the rule (NOISE), or a skip of catalog 4.9 applies.
 *
 * @param call - Method call.
 * @param rule - Rule of the method name.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getSkip(
  call: MethodCall,
  rule: MethodRule,
  context: MutatorContext<MethodCallOptions>,
): SkipNote | null {
  if (!acceptsReceiver(call, rule, context)) {
    return {
      reason:
        rule.receivers === null ?
          'the receiver is not the global Math'
        : `the type hints say the receiver is not of type ${rule.receivers.join(' or ')}`,
      rule: 'receiver-type',
    }
  }
  return getEquivalentSkip(call, rule, context)
}

/**
 * Tells whether a value, through wrappers, is the object of a non-computed
 * `.length`.
 *
 * @param node - Value of the call.
 * @param context - Mutator context of the file.
 * @returns Whether only the length of the value is read.
 */
function isLengthObject(node: Node, context: MutatorContext): boolean {
  let { parent } = context.syntax.getContextSlot(node)
  return (
    parent?.type === 'MemberExpression' &&
    !parent.computed &&
    parent.property.name === 'length'
  )
}

/**
 * Tells whether a call's callee is directly a non-computed member with an
 * identifier name (catalog 4.9, matches).
 *
 * @param node - Call expression.
 * @returns Whether the call is a method call the table can match.
 */
function isMethodCall(node: CallExpression): node is MethodCall {
  let { callee } = node
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier'
  )
}

/**
 * Tells whether a node is a string literal, or a template without expressions,
 * whose text the case method leaves unchanged.
 *
 * @param node - Other operand or first argument.
 * @param lower - Whether the method lowers the case.
 * @returns Whether the original method does not change the literal.
 */
function isCaseless(node: Node, lower: boolean): boolean {
  let value = getLiteralValue(node)
  return (
    typeof value === 'string' &&
    (lower ? value.toLowerCase() : value.toUpperCase()) === value
  )
}

/**
 * Finds the node a mutant of the call replaces: the call itself, or the root of
 * its optional chain when an optional link at or below the call can skip it
 * (T10).
 *
 * @param call - Method call.
 * @param context - Mutator context of the file.
 * @returns The replaced node, which may still lie where the mutant switch
 *   cannot wrap it, as for the operand of `delete`.
 */
function getTarget(call: CallExpression, context: MutatorContext): Node {
  let { syntax } = context
  return syntax.isValuePosition(call) ? call : (
      (syntax.getChainRoot(call) ?? call)
    )
}
