import type { TSTypeAssertion, TSAsExpression, TSType } from 'oxc-parser'

/**
 * Finds the type that an `as` expression or a `<T>x` assertion gives its value.
 *
 * @param node - `as` expression or angle-bracket assertion.
 * @returns The asserted type, or null for `as const`, which keeps the type of
 *   the operand.
 */
export function getAssertedType(
  node: TSTypeAssertion | TSAsExpression,
): TSType | null {
  let { typeAnnotation } = node
  return (
      typeAnnotation.type === 'TSTypeReference' &&
        typeAnnotation.typeName.type === 'Identifier' &&
        typeAnnotation.typeName.name === 'const'
    ) ?
      null
    : typeAnnotation
}
