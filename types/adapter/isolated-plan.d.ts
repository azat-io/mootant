import type { TryLimits } from './try-limits'

/**
 * One mutant active in one whole test file from the moment the file starts
 * loading, in a fresh module graph: every test of the file runs, since a test
 * that does not reach the mutant may still see the state an earlier test left,
 * until a test fails after the mutant was reached. That failure kills the
 * mutant whatever runs next, so the adapter may skip the tests left; suite
 * hooks that started, fixture cleanup and teardown still run.
 */
export interface IsolatedUnit {
  /**
   * Hit limit and timeout of the whole unit (load plus its tests).
   */
  limits: TryLimits

  /**
   * Name of the test runner's project to run the test file in (see
   * `DryFile.project`).
   */
  project: string

  /**
   * Id of the mutant.
   */
  mutant: string

  /**
   * Absolute path of the test file.
   */
  file: string
}

/**
 * Units of one isolated run. Several units may share a test file; they never
 * run at the same time.
 */
export interface IsolatedPlan {
  /**
   * Units of the run; results refer to them by index.
   */
  units: IsolatedUnit[]
}
