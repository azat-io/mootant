import type { AST } from '@eslint-community/regexpp'

/**
 * Tells whether an element matches every character and nothing else: `[^]`, a
 * class that holds an escape and its negation such as `[\s\S]`, or `.` with the
 * `s` flag. A `v` class with a string disjunction, a property of strings, a
 * nested class or a set operation may also match the empty string or several
 * characters, as `[\s\S\q{}]` does, so it does not count.
 *
 * @param node - Element of a pattern.
 * @param flags - Flags of the literal.
 * @returns Whether the element matches any one character.
 */
export function matchesAnyCharacter(node: AST.Node, flags: string): boolean {
  if (node.type === 'CharacterSet' && node.kind === 'any') {
    return flags.includes('s')
  }
  if (node.type !== 'CharacterClass') {
    return false
  }
  if (node.negate) {
    return node.elements.length === 0
  }
  if (node.elements.some(mayHoldStrings)) {
    return false
  }
  let escapes = new Set<string>()
  for (let element of node.elements) {
    if (element.type === 'CharacterSet' && element.kind !== 'property') {
      escapes.add(`${element.kind}:${element.negate}`)
    }
  }
  return ['digit', 'space', 'word'].some(
    kind => escapes.has(`${kind}:true`) && escapes.has(`${kind}:false`),
  )
}

/**
 * Tells whether a class element may match something other than one character.
 *
 * @param element - Element of a class.
 * @returns Whether the element is a string disjunction, a property of strings,
 *   a nested class or a set operation.
 */
function mayHoldStrings(element: AST.CharacterClassElement): boolean {
  switch (element.type) {
    case 'CharacterClassRange':
    case 'Character':
      return false
    case 'CharacterSet':
      return element.kind === 'property' && element.strings
    default:
      return true
  }
}
