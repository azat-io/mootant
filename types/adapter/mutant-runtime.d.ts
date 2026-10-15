/**
 * Switch and counters read through `globalThis.__mootant`. Adapters drive the
 * fields; switched code only calls `hit`.
 */
export interface MutantRuntime {
  /**
   * Receives the id of every evaluated site while it is set, such as a `Set`,
   * or null.
   */
  coverage: { add(id: string): unknown } | null

  /**
   * Counts one site evaluation, records the id when `coverage` is set, sets
   * `reached` when `id` is active, and tells whether it is.
   *
   * @throws Error - `MootantHitLimitError` when `hits` exceeds `hitLimit`;
   *   every later call throws too until `hits` is reset.
   */
  hit(id: string): boolean

  /**
   * Id of the active mutant, or null for the original code.
   */
  active: string | null

  /**
   * Whether `hit` returned true since the last reset.
   */
  reached: boolean

  /**
   * Evaluations allowed; `Infinity` when there is no limit.
   */
  hitLimit: number

  /**
   * Evaluations since the last reset.
   */
  hits: number
}
