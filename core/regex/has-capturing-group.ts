import type { AST } from '@eslint-community/regexpp'

import { loadRegexpp } from './load-regexpp'

/**
 * Tells whether a part of a pattern is or holds a capturing group. Removing
 * such a part renumbers the groups after it, so `$2` and `\2` would point at
 * another group, and without `u` a dangling `\2` silently becomes an octal
 * escape.
 *
 * @param node - Part of a pattern tree.
 * @returns Whether the part captures.
 */
export function hasCapturingGroup(node: AST.Node): boolean {
  let found = false
  loadRegexpp().visitRegExpAST(node, {
    onCapturingGroupEnter() {
      found = true
    },
  })
  return found
}
