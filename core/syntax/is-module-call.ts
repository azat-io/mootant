import type { CallExpression } from 'oxc-parser'

import { getMemberPath } from './get-member-path'

/**
 * Callee paths of calls whose first argument is a module specifier.
 */
let specifierCallPaths = new Set([
  'import.meta.resolve',
  'require.resolve',
  'module.require',
  'require',
])

/**
 * Callee paths of calls whose every argument must stay literal, because the
 * bundler rewrites the call at transform time: `import.meta.glob` patterns and
 * options.
 */
let literalCallPaths = new Set(['import.meta.glob'])

/**
 * Tells whether an argument of a call is module metadata that must not be
 * mutated: the first argument of `require`, `require.resolve`, `module.require`
 * and `import.meta.resolve`, and every argument of `import.meta.glob`. The
 * check is by name, so a same-file function named `require` also matches.
 *
 * @param node - Call to check.
 * @param index - Index of the argument.
 * @returns Whether the argument at the index is module metadata.
 */
export function isModuleCall(node: CallExpression, index: number): boolean {
  let path = getMemberPath(node.callee)?.join('.')
  if (path === undefined) {
    return false
  }
  return (
    literalCallPaths.has(path) || (index === 0 && specifierCallPaths.has(path))
  )
}
