/**
 * File that took part in a list run.
 */
export interface ListReportFile {
  /**
   * Whether the file was read and parsed. A file that was not has no mutants
   * and an error diagnostic.
   */
  parsed: boolean

  /**
   * Number of its mutants, pending and ignored.
   */
  mutants: number

  /**
   * Path relative to the working directory, with `/` separators.
   */
  file: string
}
