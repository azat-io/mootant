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

  /**
   * Kinds the value can surely have when `kinds` is unknown: those of the known
   * parts of a union with an unknown part, such as `null` in `User | null`
   * where `User` is imported, without duplicates and sorted by name. Omitted
   * when `kinds` is known or no part is.
   */
  knownKinds?: readonly ValueKind[]
}
