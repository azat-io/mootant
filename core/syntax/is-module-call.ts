import type { CallExpression } from 'oxc-parser'

import { getMemberPath } from './get-member-path'

/**
 * Callee paths of calls whose first argument is a module specifier.
 */
let moduleCallPaths = new Set([
  'import.meta.resolve',
  'require.resolve',
  'module.require',
  'require',
])

/**
 * Tells whether a call takes a module specifier as its first argument:
 * `require`, `require.resolve`, `module.require` or `import.meta.resolve`. The
 * check is by name, so a same-file function named `require` also matches.
 *
 * @param node - Call to check.
 * @returns Whether the first argument of the call is a module specifier.
 */
export function isModuleCall(node: CallExpression): boolean {
  let path = getMemberPath(node.callee)
  return path !== null && moduleCallPaths.has(path.join('.'))
}
