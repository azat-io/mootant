/**
 * Score of one mutated file, as the terminal lists it.
 */
export interface FileScore {
  /**
   * Mutants with status `NoCoverage`.
   */
  noCoverage: number

  /**
   * Mutants with status `Survived`.
   */
  survived: number

  /**
   * Total score of its mutants in percent with two decimals.
   */
  score: number

  /**
   * Path relative to the project root, with `/` separators.
   */
  file: string
}
