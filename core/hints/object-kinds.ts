import type { ValueKind } from '../../types/value-kind'

/**
 * Kinds of objects, which every non-primitive value has: the kinds of the
 * `object` keyword, any non-null object.
 */
export const OBJECT_KINDS: readonly ValueKind[] = [
  'function',
  'promise',
  'object',
  'array',
]
