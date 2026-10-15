/**
 * Settings of `vitestAdapter()`, which runs mutants with the project's Vitest.
 */
export interface VitestAdapterOptions {
  /**
   * Path of the Vitest configuration file, relative to the project root; Vitest
   * finds it when omitted.
   */
  config?: string
}
