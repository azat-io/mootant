import type { ParserOptions } from 'oxc-parser'

/**
 * How one program of a file is parsed.
 */
export interface ParseSettings {
  /**
   * Whether a `return` outside any function is accepted, as in the frontmatter
   * of an Astro file, which runs as the body of a function.
   */
  topLevelReturn: boolean

  /**
   * Language and source type for the parser.
   */
  options: ParserOptions

  /**
   * Number of leading code units of the text the parser reads. The blank text
   * after a script block is left out, so an error at the end of the block is
   * reported there and not at the end of the file.
   */
  length: number
}
