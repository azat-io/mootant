/**
 * Switches the texts of the modules a thread of a test process loads.
 */
export interface SourceSwitcher {
  /**
   * Gives the text to load for a module.
   *
   * @param file - Real absolute path of the module.
   * @param code - Text the loader read.
   * @returns The text to load instead, or null to load the text as it is.
   */
  switch(file: string, code: string): string | null

  /**
   * Tells whether the text of a module may change, so that a loader reads it.
   *
   * @param file - Real absolute path of the module.
   * @returns Whether the module is switched or is the test file.
   */
  has(file: string): boolean
}
