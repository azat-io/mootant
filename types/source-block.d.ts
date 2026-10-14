import type { ParseSettings } from './parse-settings'

/**
 * One program of a file: the whole text of a JavaScript or TypeScript file, or
 * one script block of a component file with everything around it blanked.
 */
export interface SourceBlock extends ParseSettings {
  /**
   * Text to parse; it has the length and the line terminators of the file, so
   * offsets and positions are those of the file.
   */
  text: string
}
