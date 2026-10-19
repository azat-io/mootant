import type { IsolatedFacts } from './isolated-result'

/**
 * Which unit of a batch or isolated plan finished, for the live progress of a
 * run.
 */
export interface UnitEnd {
  /**
   * Facts of an isolated unit as the result will report them, `inputs` aside,
   * when the adapter knows them as the unit ends; omitted for a batch unit and
   * by adapters that learn them only after the run. They only drive progress:
   * the result of the run still decides.
   */
  facts?: IsolatedFacts

  /**
   * Milliseconds a batch unit ran, from loading its test file to its end, when
   * the adapter knows it as the unit ends.
   */
  duration?: number

  /**
   * Index of the unit in the plan.
   */
  unit: number
}
