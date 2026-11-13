/**
 * How switched code at one place of a file reaches the mutant runtime.
 */
export interface SiteSyntax {
  /**
   * Writes the id of a mutant as a string literal that the place accepts.
   */
  quote(id: string): string

  /**
   * Expression that reads the runtime; undefined where none is installed.
   */
  runtime: string
}
