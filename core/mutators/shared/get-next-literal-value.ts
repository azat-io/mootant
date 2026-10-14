import type { LiteralValue } from './get-literal-value'

/**
 * Computes the value a literal mutator gives a literal (catalog 2.8): a flipped
 * boolean, a number plus one, an empty or a filled string.
 *
 * @param value - Value of the literal before the change.
 * @returns The value after the change.
 */
export function getNextLiteralValue(value: LiteralValue): LiteralValue {
  switch (typeof value) {
    case 'boolean':
      return !value
    case 'string':
      return value === '' ? 'mootant' : ''
    case 'bigint':
      return value + 1n
    default:
      return value + 1
  }
}
