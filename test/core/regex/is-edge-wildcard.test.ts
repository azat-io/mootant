import type { AST } from '@eslint-community/regexpp'

import { describe, expect, it } from 'vitest'

import { parseRegexPattern } from '../../../core/regex/parse-regex-pattern'
import { isEdgeWildcard } from '../../../core/regex/is-edge-wildcard'
import { loadRegexpp } from '../../../core/regex/load-regexpp'

/**
 * Finds the first `^` or `$` of a pattern.
 *
 * @param pattern - Pattern with an anchor.
 * @param flags - Flags after the closing slash, such as `s`.
 * @returns The first anchor assertion of the tree.
 */
function findAnchor(pattern: string, flags: string): AST.EdgeAssertion {
  let found: AST.EdgeAssertion[] = []
  loadRegexpp().visitRegExpAST(parseRegexPattern(pattern, flags)!, {
    onAssertionEnter(node) {
      if (node.kind === 'start' || node.kind === 'end') {
        found.push(node)
      }
    },
  })
  return found[0]!
}

describe('isEdgeWildcard', () => {
  it.each([
    ['^[^]*a', ''],
    ['^.*a', 's'],
    [String.raw`a[\s\S]*$`, ''],
    ['b|a[^]*$', 'm'],
  ])('accepts the anchor of %o with %o', (pattern, flags) => {
    expect(isEdgeWildcard(findAnchor(pattern, flags), flags)).toBe(true)
  })

  it.each([
    ['^.*a', ''],
    ['^[^]*?a', ''],
    ['^[^]*(?=a)|a', ''],
    ['a|^[^]*a', ''],
    ['a[^]*?$', ''],
    ['^[^]+a', ''],
    ['^[^]{0,9}a', ''],
    ['^a[^]*', ''],
    ['^[^]*a', 'g'],
    ['^[^]*a', 'y'],
    ['(?:^[^]*a)', ''],
    [String.raw`[\s\S]*$b`, ''],
    [String.raw`a^[\s\S]*`, ''],
    ['^', ''],
    ['$', ''],
  ])('rejects the anchor of %o with %o', (pattern, flags) => {
    expect(isEdgeWildcard(findAnchor(pattern, flags), flags)).toBe(false)
  })
})
