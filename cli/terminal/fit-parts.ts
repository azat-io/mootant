import type { LinePart } from '../../types/cli/line-part'

import { measureParts } from './measure-parts'

/**
 * Keeps the parts of a line that fit the width once joined, leaving out the
 * least important ones first, so a narrow terminal shows fewer parts instead of
 * wrapping the line.
 *
 * @param parts - Parts in the order they are shown.
 * @param separator - Text between two parts.
 * @param width - Most columns of the joined parts.
 * @returns The joined parts that fit and have a text, or an empty text.
 */
export function fitParts(
  parts: readonly LinePart[],
  separator: string,
  width: number,
): string {
  let kept = [...parts]
  while (kept.length > 0 && measureParts(kept, separator) > width) {
    let least = kept.reduce(
      (found, part) => (part.rank > found.rank ? part : found),
      kept[0]!,
    )
    kept = kept.filter(part => part !== least)
  }
  return kept
    .filter(part => part.text !== '')
    .map(part => part.text)
    .join(separator)
}
