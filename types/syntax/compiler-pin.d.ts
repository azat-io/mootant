import type { SourceRange } from '../source/source-range'

/**
 * Code that a framework compiler reads where it stands, such as a Svelte rune
 * call or a Vue compiler macro. A replacement that covers the code and lies
 * inside its region would move it into a branch of the mutant switch, where the
 * compiler rejects it or reads it differently.
 */
export interface CompilerPin extends SourceRange {
  /**
   * Range in which hosting a replacement that covers the code moves it.
   */
  region: SourceRange

  /**
   * Why such a replacement is skipped, worded to follow `skipped: `.
   */
  reason: string
}
