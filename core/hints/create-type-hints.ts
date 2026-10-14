import type { Node } from 'oxc-parser'

import type { TypeHintProvider } from '../../types/type-hint-provider'
import type { TypeHints } from '../../types/type-hints'
import type { ValueKind } from '../../types/value-kind'

/**
 * Builds the type questions mutators ask on top of a provider. Every question
 * that needs knowledge is false when the type is unknown, so unknown never
 * silently means safe.
 *
 * @param provider - Source of type knowledge for one file.
 * @returns The type hints of the file.
 */
export function createTypeHints(provider: TypeHintProvider): TypeHints {
  return {
    isOnly(node: Node, kinds: readonly ValueKind[]): boolean {
      let known = provider.getType(node).kinds
      return known?.every(kind => kinds.includes(kind)) === true
    },
    cannotBe(node: Node, kind: ValueKind): boolean {
      let { kinds } = provider.getType(node)
      return kinds !== null && !kinds.includes(kind)
    },
    canBe(node: Node, kind: ValueKind): boolean {
      return provider.getType(node).kinds?.includes(kind) === true
    },
    getAnnotationType(typeNode: Node) {
      return provider.getAnnotationType(typeNode)
    },
    getType(node: Node) {
      return provider.getType(node)
    },
  }
}
