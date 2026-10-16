import type { CallExpression, Node } from 'oxc-parser'

/**
 * Names of the Vue compiler macros of `<script setup>`.
 */
let macroNames = new Set([
  'defineOptions',
  'defineExpose',
  'withDefaults',
  'defineEmits',
  'defineModel',
  'defineProps',
  'defineSlots',
])

/**
 * Tells whether a node is a call of a Vue compiler macro, such as
 * `defineProps()`. The Vue compiler replaces such a call only when it stands at
 * the top level of `<script setup>`, so wrapping it in the mutant switch leaves
 * an undefined function call behind. The check is by name.
 *
 * @param node - Node of the runtime tree.
 * @returns Whether the node calls a compiler macro by its plain name.
 */
export function isVueMacroCall(node: Node): node is CallExpression {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    macroNames.has(node.callee.name)
  )
}
