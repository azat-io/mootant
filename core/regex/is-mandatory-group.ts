import type { AST } from '@eslint-community/regexpp'

/**
 * Tells whether the capturing group of a name takes part in every match of a
 * pattern, so its value in the match is always a string: the group lies on a
 * path of groups with one alternative each and of quantifiers that repeat at
 * least once, outside lookahead and lookbehind assertions. Each repetition of a
 * quantifier sets the groups inside it again, so the last one leaves the group
 * set. A group in one of several alternatives, under an optional quantifier or
 * in an assertion, which a negative one never keeps, does not count, even when
 * another group of the same name takes the other alternative.
 *
 * @param node - Pattern tree, or a part of one.
 * @param name - Group name that a read of the match's `groups` uses.
 * @returns Whether every match sets the group.
 */
export function isMandatoryGroup(node: AST.Node, name: string): boolean {
  switch (node.type) {
    case 'CapturingGroup':
    case 'Pattern':
    case 'Group':
      return (
        (node.type === 'CapturingGroup' && node.name === name) ||
        (node.alternatives.length === 1 &&
          node.alternatives[0]!.elements.some(element =>
            isMandatoryGroup(element, name),
          ))
      )
    case 'Quantifier':
      return node.min >= 1 && isMandatoryGroup(node.element, name)
    default:
      return false
  }
}
