/**
 * Data the preload passes to the module hooks it registers with
 * `module.register()`, which run in a thread of their own.
 */
export interface NodeTestHooksData {
  /**
   * Real absolute path of the test file.
   */
  main: string

  /**
   * Absolute path of the switch plan (`NodeTestPlan`).
   */
  plan: string

  /**
   * Absolute path of the out file.
   */
  out: string
}
