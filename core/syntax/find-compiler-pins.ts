import type { IdentifierReference, CallExpression, Node } from 'oxc-parser'

import type { CompilerPin } from '../../types/syntax/compiler-pin'
import type { SourceRange } from '../../types/source/source-range'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getComponentFramework } from '../parser/get-component-framework'
import { getEnclosingFunction } from './get-enclosing-function'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { isVueMacroCall } from './is-vue-macro-call'
import { getMemberPath } from './get-member-path'
import { getRawSlot } from '../tree/get-raw-slot'
import { isRuneCall } from './is-rune-call'
import { getSlot } from '../tree/get-slot'

/**
 * Svelte component or Svelte module, whose runes the compiler checks:
 * `.svelte`, or a `.js` or `.ts` file with a `.svelte.` infix, such as
 * `store.svelte.ts` or `store.svelte.test.js`, as the Svelte Vite plugin
 * matches modules.
 */
const SVELTE_FILE_PATTERN = /\.svelte(?:(?:\.[^./\\]+)*\.[jt]s)?$/u

/**
 * Finds the code of a program that its framework compiler reads where it
 * stands. In a Svelte file every rune call in an initializer position is
 * pinned: within the initializer, or within the constructor body for a `this`
 * field assigned in a constructor, since the compiler accepts such a field only
 * at the top level of the constructor. A `$inspect.trace` call is pinned within
 * the body of its function, since it must stay the first statement there. In a
 * Vue component every compiler macro call is pinned within its top-level
 * statement, and so is a static model name of `defineModel`, which the compiler
 * reads as written. Other files have no pins.
 *
 * @param tree - Runtime tree of the program.
 * @param file - Path of the file, whose extension tells the framework.
 * @returns Pins in tree order.
 */
export function findCompilerPins(tree: TreeIndex, file: string): CompilerPin[] {
  let svelte = SVELTE_FILE_PATTERN.test(file)
  let vue = getComponentFramework(file) === 'vue'
  let pins: CompilerPin[] = []
  if (!svelte && !vue) {
    return pins
  }
  for (let node of tree.order) {
    if (svelte && node.type === 'CallExpression' && isRuneCall(tree, node)) {
      pins.push({
        reason:
          'it would move a Svelte rune call out of the place the compiler accepts it in',
        region: getRuneRegion(tree, node),
        start: node.start,
        end: node.end,
      })
    }
    if (svelte && node.type === 'CallExpression') {
      pins.push(...getTracePins(tree, node))
    }
    if (vue && isVueMacroCall(node)) {
      pins.push(
        {
          reason:
            'it would move a Vue compiler macro out of the top level of the script, where the compiler reads it',
          region: getTopLevelStatement(tree, node),
          start: node.start,
          end: node.end,
        },
        ...getMacroArgumentPins(node),
      )
    }
  }
  return pins
}

/**
 * Pins the parts of the arguments of a Vue compiler macro that the compiler
 * reads as written.
 *
 * @param call - Call of a compiler macro.
 * @returns Pins of the model name or of the props declaration, if any.
 */
function getMacroArgumentPins(call: CallExpression): CompilerPin[] {
  let pins: CompilerPin[] = []
  let [argument] = call.arguments
  if (argument === undefined || argument.type === 'SpreadElement') {
    return pins
  }
  let value = unwrapExpression(argument)
  let { name } = call.callee as IdentifierReference
  if (
    name === 'defineModel' &&
    ((value.type === 'Literal' && typeof value.value === 'string') ||
      (value.type === 'TemplateLiteral' && value.expressions.length === 0))
  ) {
    pins.push(
      createPin(
        value,
        argument,
        'the Vue compiler reads the model name of defineModel as written, so the mutant switch would rename the model',
      ),
    )
  }
  if (
    name === 'defineProps' &&
    (value.type === 'ArrayExpression' || value.type === 'ObjectExpression')
  ) {
    let reason =
      'the Vue compiler reads the props that defineProps declares as written, so the mutant switch would hide them from it'
    pins.push(createPin(value, argument, reason))
    if (value.type === 'ArrayExpression') {
      for (let element of value.elements) {
        if (element !== null) {
          pins.push(createPin(unwrapExpression(element), element, reason))
        }
      }
    }
  }
  return pins
}

/**
 * Finds where wrapping a rune call moves it: the whole initializer, or the body
 * of the constructor for a `this` field assigned there.
 *
 * @param tree - Runtime tree of the program.
 * @param call - Rune call in an initializer position.
 * @returns Range of the region.
 */
function getRuneRegion(tree: TreeIndex, call: Node): SourceRange {
  let { parent } = getContextSlot(tree, call)
  if (parent!.type === 'AssignmentExpression') {
    let { body } = getEnclosingFunction(tree, parent) as { body: Node }
    return { start: body.start, end: body.end }
  }
  let value = call
  let slot = getRawSlot(tree, value)
  while (slot.parent !== parent) {
    value = slot.parent!
    slot = getRawSlot(tree, value)
  }
  return { start: value.start, end: value.end }
}

/**
 * Pins a `$inspect.trace` call inside a function within the body of the
 * function, since the Svelte compiler accepts it only as the first statement of
 * a function body (`inspect_trace_invalid_placement`).
 *
 * @param tree - Runtime tree of the program.
 * @param call - Call of the runtime tree.
 * @returns Pin of the call, if it traces a function.
 */
function getTracePins(tree: TreeIndex, call: CallExpression): CompilerPin[] {
  if (getMemberPath(call.callee)?.join('.') !== '$inspect.trace') {
    return []
  }
  let enclosing = getEnclosingFunction(tree, call)
  if (enclosing === null) {
    return []
  }
  let { body } = enclosing as { body: Node }
  return [
    createPin(
      call,
      body,
      'it would move a Svelte $inspect.trace call from the start of its function body, where the compiler accepts it',
    ),
  ]
}

/**
 * Finds the statement of the program body that holds a node.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Node of the runtime tree.
 * @returns Range of the top-level statement.
 */
function getTopLevelStatement(tree: TreeIndex, node: Node): SourceRange {
  let current = node
  let { parent } = getSlot(tree, current)
  while (parent && parent.type !== 'Program') {
    current = parent
    ;({ parent } = getSlot(tree, current))
  }
  return { start: current.start, end: current.end }
}

/**
 * Creates a pin of a node within the node itself and its wrappers.
 *
 * @param node - Node the compiler reads.
 * @param region - Node with the wrappers around it.
 * @param reason - Why a replacement that covers it is skipped.
 * @returns Pin of the node.
 */
function createPin(node: Node, region: Node, reason: string): CompilerPin {
  return {
    region: { start: region.start, end: region.end },
    start: node.start,
    end: node.end,
    reason,
  }
}
