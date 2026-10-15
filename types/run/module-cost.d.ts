/**
 * Isolated cost of one mutated source file.
 */
export interface ModuleCost {
  /**
   * Milliseconds of the isolated units that ran its mutants.
   */
  duration: number

  /**
   * Its mutants that were static.
   */
  mutants: number

  /**
   * Isolated units that ran its mutants.
   */
  units: number

  /**
   * Path relative to the project root, with `/` separators.
   */
  file: string
}
