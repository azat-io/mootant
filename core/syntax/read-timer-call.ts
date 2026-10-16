import type { CallExpression, Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TimerCall } from '../../types/syntax/timer-call'
import type { TimerKind } from '../../types/syntax/timer-kind'

import { unwrapExpression } from '../tree/unwrap-expression'
import { isNonThenable } from './is-non-thenable'
import { readImport } from './read-import'

/**
 * Names of the timers that take a delay.
 */
let timerNames = new Set(['setInterval', 'setTimeout'])

/**
 * Modules whose timers call a callback after the delay.
 */
let callbackModules = new Set(['node:timers', 'timers'])

/**
 * Modules whose timers return a promise or an async iterator.
 */
let promiseModules = new Set(['node:timers/promises', 'timers/promises'])

/**
 * Global objects whose `setTimeout` and `setInterval` are the global timers.
 */
let globalObjects = new Set(['globalThis', 'global', 'window', 'self'])

/**
 * Reads a call of a timer and where its delay is. A callback timer, whose delay
 * is the second argument, is `setTimeout` or `setInterval` called by its plain
 * name when the name is not declared in the file or is imported from
 * `node:timers`, or as a method of an undeclared global object (`globalThis`,
 * `window`, `self`, `global`) or of the namespace or default import of
 * `node:timers`. A promise timer, whose delay is the first argument, is
 * `setTimeout` or `setInterval` imported from `node:timers/promises` by name or
 * called on its namespace or default import, or `wait` of `scheduler`: the
 * undeclared global or the one of that module. `timers/promises` and `timers`
 * count as the `node:` modules. A method is read through a non-computed name or
 * a string key (`window['setTimeout']`). Awaiting a promise `setTimeout` only
 * waits when it gets no options (at most 2 arguments, 1 for `scheduler.wait`,
 * and no spread): an options object may carry an abort signal, which rejects.
 * Nor may its value be a thenable, whose state the timer promise takes on, so
 * that it also waits for the value and passes on its rejection: the value must
 * be absent or known not to be one (`isNonThenable`).
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Call to read.
 * @returns The delay index and whether awaiting the call only waits, or null
 *   when the call is not a known timer.
 */
export function readTimerCall(
  scopes: ScopeAnalysis,
  node: CallExpression,
): TimerCall | null {
  let callee = unwrapExpression(node.callee)
  let timer: TimerKind | null = null
  if (callee.type === 'Identifier') {
    timer = readNamedTimer(scopes, callee)
  } else if (callee.type === 'MemberExpression') {
    timer = readMethodTimer(scopes, callee)
  }
  if (timer === null) {
    return null
  }
  if (!timer.promise) {
    return { waits: false, delay: 1 }
  }
  let limit = timer.name === 'wait' ? 1 : 2
  let { arguments: list } = node
  let [, value] = list
  return {
    waits:
      timer.name !== 'setInterval' &&
      list.length <= limit &&
      list.every(argument => argument.type !== 'SpreadElement') &&
      (value === undefined || isNonThenable(scopes, value)),
    delay: 0,
  }
}

/**
 * Reads a timer called as a method: `wait` of the scheduler, or a timer of a
 * global object or of a timers module object.
 *
 * @param scopes - Scope analysis of the file.
 * @param callee - Member callee of the call.
 * @returns The timer name and whether it is a promise timer, or null when the
 *   method is not one.
 */
function readMethodTimer(
  scopes: ScopeAnalysis,
  callee: { type: 'MemberExpression' } & Node,
): TimerKind | null {
  let method = readMemberName(callee)
  let receiver = unwrapExpression(callee.object)
  if (method === 'wait') {
    return isScheduler(scopes, receiver) ?
        { promise: true, name: method }
      : null
  }
  if (method === null || !timerNames.has(method)) {
    return null
  }
  if (isModuleObject(scopes, receiver, promiseModules)) {
    return { promise: true, name: method }
  }
  return (
      isGlobalObject(scopes, receiver) ||
        isModuleObject(scopes, receiver, callbackModules)
    ) ?
      { promise: false, name: method }
    : null
}

/**
 * Reads a timer called by its plain name: an undeclared global or a name
 * imported from a timers module.
 *
 * @param scopes - Scope analysis of the file.
 * @param identifier - Callee of the call.
 * @returns The timer name and whether it is a promise timer, or null when the
 *   name is not one.
 */
function readNamedTimer(
  scopes: ScopeAnalysis,
  identifier: { name: string } & Node,
): TimerKind | null {
  if (!scopes.bindings.has(identifier)) {
    return timerNames.has(identifier.name) ?
        { name: identifier.name, promise: false }
      : null
  }
  let imported = readImport(scopes, identifier)
  if (imported === null || !timerNames.has(imported.name)) {
    return null
  }
  if (callbackModules.has(imported.source)) {
    return { name: imported.name, promise: false }
  }
  return promiseModules.has(imported.source) ?
      { name: imported.name, promise: true }
    : null
}

/**
 * Tells whether a receiver is `scheduler` of `node:timers/promises`: the
 * undeclared global name, the name imported from the module, or the member of
 * its namespace or default import.
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Receiver of `wait`, without wrappers.
 * @returns Whether the receiver is the scheduler.
 */
function isScheduler(scopes: ScopeAnalysis, node: Node): boolean {
  if (node.type === 'MemberExpression') {
    return (
      readMemberName(node) === 'scheduler' &&
      isModuleObject(scopes, unwrapExpression(node.object), promiseModules)
    )
  }
  if (node.type !== 'Identifier') {
    return false
  }
  if (!scopes.bindings.has(node)) {
    return node.name === 'scheduler'
  }
  let imported = readImport(scopes, node)
  return imported?.name === 'scheduler' && promiseModules.has(imported.source)
}

/**
 * Tells whether a receiver is the namespace or default import of one of the
 * modules.
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Receiver, without wrappers.
 * @param modules - Module specifiers to accept.
 * @returns Whether the receiver is the module object.
 */
function isModuleObject(
  scopes: ScopeAnalysis,
  node: Node,
  modules: Set<string>,
): boolean {
  if (node.type !== 'Identifier') {
    return false
  }
  let imported = readImport(scopes, node)
  return (
    imported !== null &&
    (imported.name === '*' || imported.name === 'default') &&
    modules.has(imported.source)
  )
}

/**
 * Reads the property name of a member: a non-computed name or a computed string
 * literal key.
 *
 * @param node - Member expression.
 * @returns The property name, or null when it is not known.
 */
function readMemberName(
  node: { type: 'MemberExpression' } & Node,
): string | null {
  if (!node.computed) {
    return node.property.name
  }
  let key = unwrapExpression(node.property)
  return key.type === 'Literal' && typeof key.value === 'string' ?
      key.value
    : null
}

/**
 * Tells whether a receiver is an undeclared global object name.
 *
 * @param scopes - Scope analysis of the file.
 * @param node - Receiver, without wrappers.
 * @returns Whether the receiver is the global object.
 */
function isGlobalObject(scopes: ScopeAnalysis, node: Node): boolean {
  return (
    node.type === 'Identifier' &&
    globalObjects.has(node.name) &&
    !scopes.bindings.has(node)
  )
}
