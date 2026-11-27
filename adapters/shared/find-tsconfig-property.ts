import type { SpreadElement, Expression } from 'oxc-parser'

/**
 * Finds a property of an object of a `tsconfig.json` file by its name, given as
 * a string or an identifier: the last one, as TypeScript keeps the last of
 * duplicate keys. Computed keys and spread elements do not count.
 *
 * @param node - Node of the file, which has properties only when it is an
 *   object.
 * @param name - Key to look for, such as `references`.
 * @returns Value of the property, or null when the node is no object or has no
 *   such property.
 */
export function findTsconfigProperty(
  node: SpreadElement | Expression | null,
  name: string,
): Expression | null {
  if (node?.type !== 'ObjectExpression') {
    return null
  }
  let property = node.properties.findLast(
    candidate =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      ((candidate.key.type === 'Literal' && candidate.key.value === name) ||
        (candidate.key.type === 'Identifier' && candidate.key.name === name)),
  )
  return property?.type === 'Property' ? property.value : null
}
