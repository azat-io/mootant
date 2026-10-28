import { getDisplayWidth } from './get-display-width'

/**
 * Finds the terminal columns of the widest text, counting wide characters as
 * two and color codes as none. Takes more texts than a function takes
 * arguments, such as every line of a long report.
 *
 * @param texts - Texts, possibly with colors.
 * @returns Columns of the widest text, 0 without texts.
 */
export function getMaxDisplayWidth(texts: readonly string[]): number {
  return texts.reduce(
    (widest, text) => Math.max(widest, getDisplayWidth(text)),
    0,
  )
}
