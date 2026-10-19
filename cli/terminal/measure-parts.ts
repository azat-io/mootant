import type { LinePart } from '../../types/cli/line-part'

import { getDisplayWidth } from './get-display-width'

/**
 * Measures parts joined by a separator, each at least as wide as its reserved
 * room.
 *
 * @param parts - Parts to measure.
 * @param separator - Text between two parts.
 * @returns Columns of the joined parts.
 */
export function measureParts(
  parts: readonly LinePart[],
  separator: string,
): number {
  let gaps = Math.max(0, parts.length - 1) * getDisplayWidth(separator)
  return parts.reduce(
    (sum, part) => sum + Math.max(part.width ?? 0, getDisplayWidth(part.text)),
    gaps,
  )
}
