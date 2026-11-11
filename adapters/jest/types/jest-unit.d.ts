import type { JestConsole } from './jest-console'

/**
 * One test file a worker runs, with a mutant active or as a dry run.
 */
export interface JestUnit {
  /**
   * Id of the active mutant, or null for a dry run, which has coverage on.
   */
  mutant: string | null

  /**
   * Console of the tests.
   */
  console: JestConsole

  /**
   * Absolute path of the switch plan (`SwitchPlan`), or null when the run
   * switches nothing.
   */
  plan: string | null

  /**
   * Site evaluations allowed, omitted in a dry run. JSON turns `Infinity` into
   * null, and a worker reads null as no limit too.
   */
  hitLimit?: number

  /**
   * Id of the project of the test file.
   */
  project: string

  /**
   * Absolute path of the test file.
   */
  file: string

  /**
   * Absolute path of the out file of the unit.
   */
  out: string
}
