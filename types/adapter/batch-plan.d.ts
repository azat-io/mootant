import type { TryLimits } from './try-limits'

/**
 * Work of one worker on one test file. Every test of the file up to the last
 * planned one runs in file order: unplanned ones once without a mutant, as in
 * the dry run; tests after the last planned one do not run.
 */
export interface BatchUnit {
  /**
   * Bounds of loading the file and of the whole unit (watchdog budget).
   */
  limits: { load: TryLimits; total: number }

  /**
   * Planned tests in file order.
   */
  tests: BatchTest[]

  /**
   * Name of the test runner's project to run the test file in (see
   * `DryFile.project`).
   */
  project: string

  /**
   * Absolute path of the test file.
   */
  file: string
}

/**
 * Work of one batch run: one unit per test file and project. The adapter never
 * runs two units of the same test file at once.
 */
export interface BatchPlan {
  /**
   * Most units to run at once in this run; the session's own concurrency when
   * omitted. The core halves it for the run that confirms timeouts.
   */
  concurrency?: number

  /**
   * Units of the run; results refer to them by index.
   */
  units: BatchUnit[]
}

/**
 * One test and the mutants it tries in order. The adapter surrounds every
 * mutant try with control tries (no mutant): control, m1, control, m2, …,
 * control; the core trusts a kill only when both controls next to it passed. A
 * mutant killed earlier in the same unit is not tried again.
 */
export interface BatchTest extends TryLimits {
  /**
   * Ids of the mutants, not empty.
   */
  mutants: string[]

  /**
   * Id of the test.
   */
  id: string
}
