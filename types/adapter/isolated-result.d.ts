import type { RunInputs } from './run-inputs'
import type { TryFacts } from './try-facts'

/**
 * Facts of one isolated unit.
 */
export interface IsolatedFacts {
  /**
   * `crash` or `hang` when the unit did not finish, else null.
   */
  incomplete: 'crash' | 'hang' | null

  /**
   * What the unit read, or null or omitted when the adapter cannot tell, as
   * after a crash; the cache then never stores the unit's evidence.
   */
  inputs?: RunInputs | null

  /**
   * Message of the first failed suite hook (`beforeAll`, `afterAll`,
   * `aroundAll`) or, after them, of the failed worker teardown, such as the
   * cleanup of worker-scoped fixtures or the teardown of the test environment,
   * or null.
   */
  hookError: string | null

  /**
   * Message of the load failure, or null.
   */
  loadError: string | null

  /**
   * Whether a suite hook ran out of time; `hookError` then holds its message.
   */
  timedOut: boolean

  /**
   * Tries of the tests that ran, in file order.
   */
  tests: TryFacts[]

  /**
   * Unhandled errors outside tests.
   */
  strays: string[]

  /**
   * Whether the mutant's site returned true anywhere in the unit.
   */
  reached: boolean

  /**
   * Milliseconds from loading to the end of the file.
   */
  duration: number

  /**
   * Site evaluations of the whole unit.
   */
  hits: number

  /**
   * Index of the unit in the plan.
   */
  unit: number
}

/**
 * What an isolated run reported; a unit without facts is planned once more,
 * then becomes `Error`.
 */
export interface IsolatedResult {
  /**
   * Facts of the units that reported, in any order.
   */
  units: IsolatedFacts[]
}
