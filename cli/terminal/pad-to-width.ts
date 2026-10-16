import { getDisplayWidth } from './get-display-width'

/**
 * Adds spaces after a text until it takes the given terminal columns, counting
 * wide characters as two and color codes as none.
 *
 * @param text - Text, possibly with colors.
 * @param width - Columns to fill.
 * @returns The padded text, or the text as is when already as wide.
 */
export function padToWidth(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - getDisplayWidth(text)))}`
}
