import type { TryFacts } from './try-facts'

/**
 * What a batch run reported. Planned tries without facts are missing: the core
 * plans them again.
 */
export interface BatchResult {
  /**
   * Units whose suite hooks (`beforeAll`, `afterAll`, `aroundAll`) or worker
   * teardown (such as the cleanup of worker-scoped fixtures or the teardown of
   * the test environment) failed, with the first message; the core sends every
   * mutant tried in such a unit that is not a trusted kill to the isolated
   * path.
   */
  hookErrors: { message: string; unit: number }[]

  /**
   * Tries in the order they ran per unit, control tries included, with the
   * index of their unit in the plan.
   */
  tries: ({ unit: number } & TryFacts)[]

  /**
   * Units that did not finish.
   */
  incomplete: IncompleteUnit[]

  /**
   * Unhandled errors after a try ended, with the mutant and test of that try.
   */
  late: LateError[]
}

/**
 * Unit of a batch plan that did not finish.
 */
export interface IncompleteUnit {
  /**
   * `hang` when the watchdog stopped the worker (the hung try is reported with
   * `timedOut`), `crash` when it died, `abandoned` when the worker stopped the
   * unit after a timed-out try.
   */
  reason: 'abandoned' | 'crash' | 'hang'

  /**
   * Sentence naming what happened, such as the error of the run.
   */
  message: string

  /**
   * Index of the unit in the plan.
   */
  unit: number
}

/**
 * Unhandled error that came after a batch try ended.
 */
export interface LateError {
  /**
   * Id of the mutant active in the try before the error, or null.
   */
  mutant: string | null

  /**
   * First line of the error.
   */
  message: string

  /**
   * Id of the test of the try before the error.
   */
  test: string
}
