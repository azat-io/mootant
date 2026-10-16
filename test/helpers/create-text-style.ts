import type { TextStyle } from '../../types/cli/text-style'

import { createColors } from '../../cli/terminal/colors'

/**
 * Creates the style of a text report for tests: no colors, no width limit and
 * Unicode symbols unless told otherwise.
 *
 * @param options - Settings that differ.
 * @param options.colors - Whether to add color codes.
 * @param options.width - Columns to fit.
 * @param options.unicode - Whether to print Unicode symbols.
 * @returns Style of the output.
 */
export function createTextStyle(
  options: { unicode?: boolean; colors?: boolean; width?: number } = {},
): TextStyle {
  return {
    colors: createColors(options.colors ?? false),
    width: options.width ?? Infinity,
    unicode: options.unicode ?? true,
  }
}
