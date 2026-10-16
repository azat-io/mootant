import type { Node } from 'oxc-parser'

import { walkTree } from '../tree/walk-tree'

/**
 * Node types that run code or change state when evaluated, or that hold code
 * another expression may run.
 */
let effectTypes = new Set<string>([
  'TaggedTemplateExpression',
  'ArrowFunctionExpression',
  'AssignmentExpression',
  'FunctionExpression',
  'ImportExpression',
  'UpdateExpression',
  'AwaitExpression',
  'YieldExpression',
  'ClassExpression',
  'CallExpression',
  'NewExpression',
  'SpreadElement',
])

/**
 * Tells whether evaluating an expression only reads values: it holds no call,
 * `new`, tagged template, dynamic import, assignment, update, `delete`,
 * `await`, `yield`, spread, function or class. Getters and conversions such as
 * `valueOf` are not known, so they do not count.
 *
 * @param node - Expression to check.
 * @returns Whether the expression and every part of it are free of effects.
 */
export function isEffectFree(node: Node): boolean {
  let free = true
  walkTree(node, child => {
    if (
      effectTypes.has(child.type) ||
      (child.type === 'UnaryExpression' && child.operator === 'delete')
    ) {
      free = false
    }
    return free
  })
  return free
}
