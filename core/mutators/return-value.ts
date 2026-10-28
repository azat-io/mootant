import type { VariableDeclarator, Node } from 'oxc-parser'

import type {
  ReturnValueKind,
  PromiseKind,
} from './shared/get-return-value-kind'
import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { Replacement } from '../../types/mutator/replacement'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'
import type { Binding } from '../../types/syntax/binding'

import { getReturnValueKind } from './shared/get-return-value-kind'
import { isPlainReturnValue } from './shared/is-plain-return-value'
import { isGlobalIdentifier } from './shared/is-global-identifier'
import { NO_OP_CALLBACK_SKIP } from './shared/no-op-callback-skip'
import { getCallbackResult } from './shared/get-callback-result'
import { getOwnerConstant } from './shared/get-owner-constant'
import { createRunContext } from './shared/create-run-context'
import { getLiteralValue } from './shared/get-literal-value'
import { getTowardMutant } from './shared/get-toward-mutant'
import { emptiesCallback } from './shared/empties-callback'
import { getMemberRoot } from '../syntax/get-member-root'

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
 * Values that the default of each promise kind resolves with, each as the text
 * and value of that default of `T`: `void 0` stands for `undefined`, since no
 * declaration can shadow it.
 */
let resolvedDefaults: Record<PromiseKind['promise'], ReturnDefault[]> = {
  boolean: [
    { text: 'true', value: true },
    { text: 'false', value: false },
  ],
  void: [{ value: undefined, text: 'void 0' }],
  null: [{ text: 'null', value: null }],
  bigint: [{ text: '0n', value: 0n }],
  string: [{ text: "''", value: '' }],
  array: [{ text: '[]', value: [] }],
  number: [{ text: '0', value: 0 }],
}

/**
 * Replaces a returned value with an empty default ('', 0, false and true, [] or
 * undefined), as catalog 4.14 states: the kind comes from the value's type or
 * the return annotation; a function that returns `Promise<T>` without `async`
 * gets `Promise.resolve` of an empty value that `T` allows in place of any
 * value but that promise; literals, `undefined`, `void x`, `this`, functions,
 * classes and logging calls are not replaced; a default that is already the
 * value or that makes the comparator of an in-place `sort` a no-op (O12) is
 * skipped. Every default but the boolean constants of a boolean kind is
 * solitary (2.6); those constants are skipped when the owner of the result
 * emits them (O19) or while a mutant moves the result toward them (R6). Skipped
 * mutants follow as skipped replacements.
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
      "Replaces a returned value with an empty default ('', 0, false and true, [] or undefined), or a promise of one.",
  },
}

/**
 * Builds the defaults of one returned value. A logging call (NOISE), a `void`
 * default of a value without an effect (EQ), a default that empties a no-op
 * callback (O12) and a boolean constant that the owner emits (O19) or a mutant
 * moves the result toward (R6) follow as skipped replacements. An async
 * function adopts a returned thenable, so its `void` default is skipped only
 * for a value that is never one.
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
  if (kind === null || isPlainReturnValue(value, context)) {
    return []
  }
  let defaults =
    typeof kind === 'object' ?
      getPromiseDefaults(kind, value, context)
    : getDefaults(kind, value)
  if (isLoggingCall(value, context)) {
    return defaults.map(item => ({
      skip: {
        reason: 'the result of a logging call is not worth a test',
        rule: 'logging-call',
      },
      text: item.text,
      node: target,
    }))
  }
  if (
    kind === 'void' &&
    !hasEffect(value) &&
    (!syntax.getEnclosingFunction(target)?.async || syntax.isNonThenable(value))
  ) {
    return [
      {
        skip: {
          reason:
            'the function returns void and the value has no effect to remove',
          rule: 'void-result',
        },
        text: 'undefined',
        node: target,
      },
    ]
  }
  let callback = getCallbackResult(target, context)
  let solitary =
    kind === 'boolean' ? null : [target, ...getLocalRanges(value, context)]
  return defaults.map(item => {
    let replacement: Replacement =
      solitary ?
        { text: item.text, node: target, solitary }
      : { text: item.text, node: target }
    let skip: SkipNote | null =
      callback && emptiesCallback(callback.owner, item.value) ?
        NO_OP_CALLBACK_SKIP
      : null
    if (!skip && kind === 'boolean') {
      skip = getConstantSkip(target, item.value === true, context)
    }
    if (skip) {
      replacement.skip = skip
    }
    return replacement
  })
}

/**
 * Tells whether a returned expression of a function with a promise kind, whose
 * `Promise` is the global one, is a `Promise.resolve` call, wrappers of the
 * callee and of `Promise` included, with one argument that is the given
 * default, or with none for `undefined`: `undefined` is also the undeclared
 * name or `void` of a literal, `null` the `null` literal, `[]` an empty array
 * literal, and any other default a literal of that value.
 *
 * @param value - Returned expression, through wrappers.
 * @param resolved - Value of the default that the promise resolves with.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is already the default.
 */
function resolvesWith(
  value: Node,
  resolved: unknown,
  context: MutatorContext,
): boolean {
  if (value.type !== 'CallExpression' || value.arguments.length > 1) {
    return false
  }
  let { syntax } = context
  let callee = syntax.unwrapExpression(value.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.name !== 'resolve'
  ) {
    return false
  }
  let object = syntax.unwrapExpression(callee.object)
  if (object.type !== 'Identifier' || object.name !== 'Promise') {
    return false
  }
  let [argument] = value.arguments
  if (!argument) {
    return resolved === undefined
  }
  if (argument.type === 'SpreadElement') {
    return false
  }
  let inner = syntax.unwrapExpression(argument)
  if (resolved === undefined) {
    return (
      (inner.type === 'UnaryExpression' &&
        inner.operator === 'void' &&
        syntax.unwrapExpression(inner.argument).type === 'Literal') ||
      isGlobalIdentifier(inner, 'undefined', context)
    )
  }
  if (resolved === null) {
    return inner.type === 'Literal' && inner.raw === 'null'
  }
  if (Array.isArray(resolved)) {
    return inner.type === 'ArrayExpression' && inner.elements.length === 0
  }
  return Object.is(getLiteralValue(inner), resolved)
}

/**
 * Decides whether a boolean constant of a returned value is skipped (catalog
 * 4.14): the owner of the result emits the constant (O19), or a mutant that
 * will run moves the result, or a value assigned to its local, toward it (R6).
 *
 * @param target - Returned value, through parentheses.
 * @param value - Constant written in place of the value.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the constant is emitted.
 */
function getConstantSkip(
  target: Node,
  value: boolean,
  context: MutatorContext,
): SkipNote | null {
  let owner = getOwnerConstant(target, value, context)
  if (owner) {
    return {
      reason: `the owner of the result emits the constant ${value}`,
      rule: 'O19',
      by: owner,
    }
  }
  let sources = [
    target,
    ...getAssignedValues(context.syntax.unwrapExpression(target), context),
  ]
  let candidate = { mutator: context.id, node: target }
  let runContext = createRunContext(context)
  for (let source of sources) {
    let toward = getTowardMutant(
      { decision: source, candidate, value },
      runContext,
    )
    if (toward) {
      return {
        reason: `a running mutant moves the result toward ${value}`,
        by: toward,
        rule: 'R6',
      }
    }
  }
  return null
}

/**
 * Lists the defaults of a kind (catalog 4.14, emission by kind), without the
 * one the value already is: an empty array literal or an empty template. The
 * `void` kind gets `undefined`; its caller skips it for a value without an
 * effect.
 *
 * @param kind - Kind of the returned value, not a promise kind.
 * @param value - Returned expression, through wrappers.
 * @returns The defaults in emission order.
 */
function getDefaults(
  kind: Exclude<ReturnValueKind, PromiseKind>,
  value: Node,
): ReturnDefault[] {
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
    default:
      return [{ text: 'undefined', value: undefined }]
  }
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
  let root = getMemberRoot(value)
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
 * Lists the defaults of a function that returns `Promise<T>` without `async`
 * (catalog 4.14): `Promise.resolve` of each value its promise kind resolves
 * with (see `resolvedDefaults`). The value is always replaced, since the
 * settlement and timing of the returned promise are observable, unless it
 * already is that default. A promise is an object without a primitive value, so
 * its value for the no-op callback rule is an empty object: both compare as
 * `NaN` in a comparator.
 *
 * @param kind - Promise kind of the function.
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns The defaults in emission order.
 */
function getPromiseDefaults(
  kind: PromiseKind,
  value: Node,
  context: MutatorContext,
): ReturnDefault[] {
  return resolvedDefaults[kind.promise]
    .filter(item => !resolvesWith(value, item.value, context))
    .map(item => ({ text: `Promise.resolve(${item.text})`, value: {} }))
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
 * Tells whether a returned expression is a logging call, also as an optional
 * chain (catalog 4.14, NOISE).
 *
 * @param value - Returned expression, through wrappers.
 * @param context - Mutator context of the file.
 * @returns Whether the value is a logging call.
 */
function isLoggingCall(value: Node, context: MutatorContext): boolean {
  let call = value.type === 'ChainExpression' ? value.expression : value
  return call.type === 'CallExpression' && context.syntax.isLoggingCall(call)
}
