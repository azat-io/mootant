/**
 * What one test process runs, as the main process passes it to the preload in
 * the `MOOTANT_UNIT` environment variable, JSON encoded.
 */
export interface NodeTestUnit {
  /**
   * Tests that failed in the dry run of a test file that still exited with 0,
   * such as failing todo tests, by full name and occurrence (`NodeTestTry`);
   * their failures never count and never stop the unit. Empty in a dry run.
   */
  expected: { occurrence: number; name: string }[]

  /**
   * Kind of the run: a dry run records the sites each try evaluates; an
   * isolated unit keeps its mutant active through the whole file.
   */
  mode: 'isolated' | 'dry'

  /**
   * Evaluations of mutant sites the whole process may make, load included, or
   * null for no limit.
   */
  hitLimit: number | null

  /**
   * Id of the mutant active from the start, or null for the original code.
   */
  mutant: string | null

  /**
   * Whether the unit stops starting tests once a test failed after the mutant
   * was reached. False in a dry run.
   */
  bail: boolean

  /**
   * Absolute path of the switch plan (`NodeTestPlan`).
   */
  plan: string

  /**
   * Project root; files the test code reads count as inputs only inside it.
   */
  root: string

  /**
   * Absolute path of the out file the process appends its records to.
   */
  out: string
}
