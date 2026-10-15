import type { Program, Comment } from 'oxc-parser'

/**
 * Source file that parsed without errors, with the lookup tables the text
 * helpers need.
 */
export interface ParsedFile {
  /**
   * Module system, from the extension or the syntax; a script block of a
   * component file is a module.
   */
  sourceType: 'commonjs' | 'module' | 'script'

  /**
   * Comment end offsets keyed by comment start offsets.
   */
  commentEnds: ReadonlyMap<number, number>

  /**
   * Language family, from the extension or the `lang` of a script block.
   */
  language: 'javascript' | 'typescript'

  /**
   * Offsets at which lines start; the first entry skips a byte order mark.
   */
  lineStarts: readonly number[]

  /**
   * Comments in source order, without the hashbang.
   */
  comments: readonly Comment[]

  /**
   * Root of the tree.
   */
  program: Program

  /**
   * Path as reports print it.
   */
  file: string

  /**
   * Text as read from disk, or for a script block of a component file that text
   * with everything outside the block blanked; every offset of the tree indexes
   * into it.
   */
  text: string
}
