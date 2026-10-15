import type { ValueKind } from '../../types/hints/value-kind'

/**
 * Kinds of a value about which nothing is known except that it is not nullish.
 */
export const NON_NULLISH_KINDS: readonly ValueKind[] = [
  'function',
  'boolean',
  'promise',
  'string',
  'number',
  'bigint',
  'object',
  'symbol',
  'array',
]
