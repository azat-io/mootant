import type { VariableDeclarator, Node } from 'oxc-parser'

import type { ReturnValueKind } from './shared/get-return-value-kind'
import type { MutatorContext } from '../../types/mutator-context'
import type { Replacement } from '../../types/replacement'
import type { Binding } from '../../types/binding'
import type { Mutator } from '../../types/mutator'

import { getReturnValueKind } from './shared/get-return-value-kind'
import { isPlainReturnValue } from './shared/is-plain-return-value'
import { ownerEmitsConstant } from './shared/owner-emits-constant'
import { getCallbackResult } from './shared/get-callback-result'
import { createRunContext } from './shared/create-run-context'
import { getLiteralValue } from './shared/get-literal-value'
import { emptiesCallback } from './shared/empties-callback'
import { isMovedToward } from './shared/is-moved-toward'

/**
 * Default written in place of a returned value.
 */
interface ReturnDefault {
  /**
   * Value of the default, for the no-op callback rule.
   */
  value: unknown

  /**
   * Text of the default.
   */
  text: string
}

/**
 * Declaration kinds of the locals whose initializer and writes are solitary
 * ranges of a returned value.
 */
let localKinds = new Set<Binding['kind']>(['const', 'let', 'var'])

/**
 * Expression types that have an effect, which a `void` function's default
 * removes.
 */
let effectTypes = new Set<Node['type']>([
  'TaggedTemplateExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'AwaitExpression',
  'YieldExpression',
  'CallExpression',
  'NewExpression',
])

/**
 * Replaces a returned value with an empty default ('', 0, false and true, [] or
 * undefined), as catalog 4.14 states: the kind comes from the value's type or
 * the return annotation; literals, `undefined`, `void x`, `this`, functions,
 * classes and logging calls are not replaced; a default that is already the
 * value or that makes the comparator of an in-place `sort` a no-op (O12) is
 * skipped. Every default but the boolean constants is solitary (2.6); the
 * boolean constants are skipped when the owner of the result emits them (O19)
 * or while a mutant moves the result toward them (R6).
 */
export let returnValue: Mutator = {
  create(context) {
    return {
      ArrowFunctionExpression(node) {
        return node.body.type === 'BlockStatement' ?
            []
          : getReplacements(node.body, context)
      },
      ReturnStatement(node) {
        return node.argument ? getReplacements(node.argument, context) : []
      },
    }
  },
  meta: {
    description:
      "Replaces a returned value with an empty default ('', 0, false and true, [] or undefined).",
  },
}

/**
 * Builds the defaults of one returned value.
 *
 * @param returned - Argument of a `return` or concise body of an arrow.
 * @param context - Mutator context of the file.
 * @returns The replacements in emission order.
 */
function getReplacements(
  returned: Node,
  context: MutatorContext,
): readonly Replacement[] {
  let { syntax } = context
  let target = syntax.unwrapParentheses(returned)
  let value = syntax.unwrapExpression(target)
  let kind = getReturnValueKind(target, context)
  if (kind === null || !isReplaceable(value, context)) {
    return []
  }
  let callback = getCallbackResult(target, context)
  let defaults = getDefaults(kind, value).filter(
    item => !callback || !emptiesCallback(callback.owner, item.value),
  )
  if (kind === 'boolean') {
    let sources = [target, ...getAssignedValues(value, context)]
    let candidate = { mutator: context.id, node: target }
    let runContext = createRunContext(context)
    return defaults
      .filter(
        item =>
          !ownerEmitsConstant(target, item.value === true, context) &&
          sources.every(
            source =>
              !isMovedToward(
                { value: item.value === true, decision: source, candidate },
                runContext,
              ),
          ),
      )
      .map(item => ({ text: item.text, node: target }))
  }
  let solitary = [target, ...getLocalRanges(value, context)]
  return defaults.map(item => ({ text: item.text, node: target, solitary }))
}

/**
 * Lists the defaults of a kind (catalog 4.14, emission by kind), without the
 * one the value already is: an empty array literal or an empty template.
 *
 * @param kind - Kind of the returned value.
 * @param value - Returned expression, through wrappers.
 * @returns The defaults in emission order.
 */
function getDefaults(kind: ReturnValueKind, value: Node): ReturnDefault[] {
  switch (kind) {
    case 'boolean':
      return [
        { text: 'true', value: true },
        { text: 'false', value: false },
      ]
    case 'nullish':
      return []
    case 'string':
      return getLiteralValue(value) === '' ? [] : [{ text: "''", value: '' }]
    case 'number':
      return [{ text: '0', value: 0 }]
    case 'bigint':
      return [{ text: '0n', value: 0n }]
    case 'array':
      return value.type === 'ArrayExpression' && value.elements.length === 0 ?
          []
        : [{ text: '[]', value: [] }]
    case 'void':
      return hasEffect(value) ? [{ text: 'undefined', value: undefined }] : []
    default:
      return [{ text: 'undefined', value: undefined }]
  }
}

/**
 * Finds the binding of a returned local (catalog 2.6): the value is, through
 * wrappers, an identifier or a member chain whose root object is an identifier,
 * bound by a `const`, `let` or `var` declarator of the function that returns
 * it. A name declared outside the runtime tree, such as by a `declare`
 * statement, is not a local.
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns The binding, or null.
 */
function getLocalBinding(value: Node, context: MutatorContext): Binding | null {
  let { sourceCode, syntax } = context
  let root = value
  while (root.type === 'MemberExpression' || root.type === 'ChainExpression') {
    root = syntax.unwrapExpression(
      root.type === 'ChainExpression' ? root.expression : root.object,
    )
  }
  let binding = sourceCode.getBinding(root)
  return (
      binding &&
        localKinds.has(binding.kind) &&
        syntax.isRuntimeNode(binding.declaration) &&
        syntax.getEnclosingFunction(binding.declaration) ===
          syntax.getEnclosingFunction(value)
    ) ?
      binding
    : null
}

/**
 * Lists the extra solitary ranges of a returned value (catalog 2.6): the
 * initializer of a returned local, or of the root of a returned member chain,
 * and its writes in the same function. Writes outside the runtime tree, such as
 * in the arguments of a logging call, are never mutated and are left out.
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns The initializer and the writes.
 */
function getLocalRanges(value: Node, context: MutatorContext): Node[] {
  let binding = getLocalBinding(value, context)
  if (!binding) {
    return []
  }
  let { init } = binding.declaration as VariableDeclarator
  let { syntax } = context
  let enclosing = syntax.getEnclosingFunction(value)
  return [
    ...(init ? [init] : []),
    ...binding.writes.filter(
      write =>
        syntax.isRuntimeNode(write) &&
        syntax.getEnclosingFunction(write) === enclosing,
    ),
  ]
}

/**
 * Tells whether evaluating an expression has an effect that a `void` function's
 * default would remove: a call, `new`, `await`, assignment, update, `delete`,
 * tagged template or `yield`, also as an element of a sequence or as a call in
 * an optional chain.
 *
 * @param node - Expression, through wrappers.
 * @returns Whether the expression has an effect.
 */
function hasEffect(node: Node): boolean {
  switch (node.type) {
    case 'SequenceExpression':
      return node.expressions.some(hasEffect)
    case 'ChainExpression':
      return node.expression.type === 'CallExpression'
    case 'UnaryExpression':
      return node.operator === 'delete'
    default:
      return effectTypes.has(node.type)
  }
}

/**
 * Lists the other sources of a returned local's value (catalog 4.14, R6): the
 * initializer and the right sides of the `=` writes in the same function. Other
 * writes are listed whole; no mutant moves them toward a constant.
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns The source expressions.
 */
function getAssignedValues(value: Node, context: MutatorContext): Node[] {
  if (value.type !== 'Identifier') {
    return []
  }
  return getLocalRanges(value, context).map(range =>
    range.type === 'AssignmentExpression' && range.operator === '=' ?
      range.right
    : range,
  )
}

/**
 * Tells whether return-value replaces a returned expression: not a literal (a
 * negative number literal included), `undefined`, `void x` (EQ), `this`
 * (statement-removal removes `return this`), a function or class expression
 * (COARSE) or a logging call, also as an optional chain (NOISE).
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns Whether the value gets a default.
 */
function isReplaceable(value: Node, context: MutatorContext): boolean {
  let call = value.type === 'ChainExpression' ? value.expression : value
  return (
    !isPlainReturnValue(value, context) &&
    (call.type !== 'CallExpression' || !context.syntax.isLoggingCall(call))
  )
}
