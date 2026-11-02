import type { AST } from '@eslint-community/regexpp'

/**
 * Finds the part of a pattern in which the upper bound of a quantifier does not
 * change whether that part matches, as long as the pattern has no
 * backreference, so that one repeat does not depend on another:
 *
 * - The whole pattern, for code that only asks whether it matches, when nothing
 *   required stands before the quantifier or nothing required stands after it,
 *   an element under a quantifier with a lower bound of 0 not being required. A
 *   search also starts later, so `x{2,5}y` matches where `x{2}y` matches at its
 *   last two repeats; and a match may also end earlier, so `yx{2,5}` matches
 *   where `yx{2}` matches at its first two.
 * - A lookaround, when nothing required stands beyond the quantifier at the end
 *   that the lookaround reaches last: the end of a lookahead, and the start of
 *   a lookbehind, which matches backward. A lookaround starts at one place, so
 *   the other end does not count.
 *
 * The walk goes up through groups, where the other alternatives stay as they
 * are, but not through another quantifier, since its next repeat would stand
 * right after this one.
 *
 * @param node - Quantifier of a pattern tree.
 * @returns The pattern or the lookaround, or null when the upper bound may
 *   change whether it matches.
 */
export function findOpenRepeatScope(
  node: AST.Quantifier,
): AST.LookaroundAssertion | AST.Pattern | null {
  let isStartOpen = true
  let isEndOpen = true
  let current: AST.CapturingGroup | AST.Quantifier | AST.Group = node
  while (current.parent.type === 'Alternative') {
    let alternative: AST.Alternative = current.parent
    let index = alternative.elements.indexOf(current)
    isStartOpen &&= alternative.elements.slice(0, index).every(isOptional)
    isEndOpen &&= alternative.elements.slice(index + 1).every(isOptional)
    let holder = alternative.parent
    switch (holder.type) {
      case 'CapturingGroup':
      case 'Group':
        current = holder
        break
      case 'Pattern':
        return isStartOpen || isEndOpen ? holder : null
      default:
        return (
            holder.kind === 'lookahead' ? isEndOpen : isStartOpen
          ) ?
            holder
          : null
    }
  }
  return null
}

/**
 * Tells whether an element of an alternative may be left out of a match.
 *
 * @param element - Element of an alternative.
 * @returns Whether the element is under a quantifier with a lower bound of 0.
 */
function isOptional(element: AST.Element): boolean {
  return element.type === 'Quantifier' && element.min === 0
}
