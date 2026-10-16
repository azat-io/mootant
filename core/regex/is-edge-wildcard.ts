import type { AST } from '@eslint-community/regexpp'

import { matchesAnyCharacter } from './matches-any-character'

/**
 * Tells whether removing an anchor cannot change a match, because a greedy
 * wildcard that runs to the edge stands next to it: `^[^]*` at the start of a
 * pattern with one alternative, or `[^]*$` at the end of a top-level
 * alternative, where the wildcard matches every character (`[^]`, `[\s\S]`, or
 * `.` with `s`) any number of times. A greedy wildcard from the start of the
 * text already ends where any later match could, and a greedy wildcard already
 * runs to the end, so the match stays the same. With `g` or `y` the search may
 * start later and the anchor matters, and `.*` without `s` stops at line
 * breaks, so neither counts. `split` tries a match at every position, so a lazy
 * wildcard after `^` (`'ab'.split(/^[^]*?/)` keeps `'ab'` whole, while
 * `/[^]*?/` splits it) or another alternative next to it (`/^[^]*(?=X)|X/`)
 * makes the `^` matter.
 *
 * @param anchor - `^` or `$` assertion.
 * @param flags - Flags of the literal.
 * @returns Whether the anchor is redundant.
 */
export function isEdgeWildcard(
  anchor: AST.EdgeAssertion,
  flags: string,
): boolean {
  let alternative = anchor.parent
  if (
    alternative.type !== 'Alternative' ||
    alternative.parent.type !== 'Pattern' ||
    flags.includes('g') ||
    flags.includes('y')
  ) {
    return false
  }
  let { elements } = alternative
  let index = elements.indexOf(anchor)
  let isStart = anchor.kind === 'start'
  if (
    index !== (isStart ? 0 : elements.length - 1) ||
    (isStart && alternative.parent.alternatives.length > 1)
  ) {
    return false
  }
  let neighbor = elements[isStart ? index + 1 : index - 1]
  return (
    neighbor?.type === 'Quantifier' &&
    neighbor.min === 0 &&
    neighbor.max === Infinity &&
    neighbor.greedy &&
    matchesAnyCharacter(neighbor.element, flags)
  )
}
