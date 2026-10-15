import type { ValueKind } from './value-kind'

/**
 * What is known about the runtime type of an expression.
 */
export interface InferredType {
  /**
   * Kinds the value can have, without duplicates and sorted by name; null when
   * nothing is known.
   */
  kinds: readonly ValueKind[] | null
}
