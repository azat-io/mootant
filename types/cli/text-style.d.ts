import type { ColorName, Color } from '../../cli/terminal/colors'

/**
 * How text reports look where they are printed.
 */
export interface TextStyle {
  /**
   * Color functions; they return plain text when colors are off.
   */
  colors: Record<ColorName, Color>

  /**
   * Whether the terminal shows Unicode symbols, such as `→` and `●`.
   */
  unicode: boolean

  /**
   * Columns lines should fit in, or `Infinity` when the output is not a
   * terminal, so nothing is cut.
   */
  width: number
}
