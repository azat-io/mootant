import type { AST } from '@eslint-community/regexpp'

import { loadRegexpp } from './load-regexpp'

/**
 * Tells whether a pattern has a backreference anywhere, numbered or named. What
 * a part of such a pattern can match may depend on what a group took earlier in
 * the same match.
 *
 * @param node - Pattern tree, or a part of one.
 * @returns Whether the pattern refers back to a group.
 */
export function hasBackreference(node: AST.Node): boolean {
  let found = false
  loadRegexpp().visitRegExpAST(node, {
    onBackreferenceEnter() {
      found = true
    },
  })
  return found
}
