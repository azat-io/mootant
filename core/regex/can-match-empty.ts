import type { AST } from '@eslint-community/regexpp'

/**
 * Tells whether a part of a pattern may match the empty string. Assertions and
 * backreferences count as empty, since they may consume nothing; a class
 * matches one character, unless a `v` class holds an empty string such as
 * `\q{}`. For a class the answer is exact, since a subtraction depends on it:
 * the empty string is in `A--B` when it is in `A` and not in `B`, and in `A&&B`
 * when it is in both; a negated class never holds strings. Elsewhere the answer
 * errs toward true.
 *
 * @param node - Pattern, alternative or element.
 * @returns Whether the node may match without consuming a character.
 */
export function canMatchEmpty(node: AST.Node): boolean {
  switch (node.type) {
    case 'ExpressionCharacterClass':
      return !node.negate && canMatchEmpty(node.expression)
    case 'ClassStringDisjunction':
      return node.alternatives.some(
        alternative => alternative.elements.length === 0,
      )
    case 'ClassIntersection':
      return canMatchEmpty(node.left) && canMatchEmpty(node.right)
    case 'ClassSubtraction':
      return canMatchEmpty(node.left) && !canMatchEmpty(node.right)
    case 'CapturingGroup':
    case 'Pattern':
    case 'Group':
      return node.alternatives.some(canMatchEmpty)
    case 'CharacterClass':
      return !node.negate && node.elements.some(canMatchEmpty)
    case 'Backreference':
    case 'Assertion':
      return true
    case 'Alternative':
      return node.elements.every(canMatchEmpty)
    case 'Quantifier':
      return node.min === 0 || canMatchEmpty(node.element)
    default:
      return false
  }
}
