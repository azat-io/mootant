import type { AST } from '@eslint-community/regexpp'

import { loadRegexpp } from './load-regexpp'

/**
 * Tells whether a pattern has a named capturing group anywhere, inside
 * lookahead and lookbehind assertions too. A match of such a pattern always has
 * a `groups` object, whether each group takes part in it or not.
 *
 * @param node - Pattern tree, or a part of one.
 * @returns Whether the pattern names a group.
 */
export function hasNamedGroup(node: AST.Node): boolean {
  let found = false
  loadRegexpp().visitRegExpAST(node, {
    onCapturingGroupEnter(group) {
      found ||= group.name !== null
    },
  })
  return found
}
