/**
 * Switch and counters read through `globalThis.__mootant`. Adapters drive the
 * fields; switched code calls `hit` and `hitAny`, and the copy of a literal
 * that removes an element uses `gap`, `none` and `cut`.
 */
export interface MutantRuntime {
  /**
   * Receives the id of every evaluated site while it is set, such as a `Set`,
   * or null.
   */
  coverage: { add(id: string): unknown } | null

  /**
   * Calls `hit` for each id in order until one is active, as a chain of `hit`
   * calls joined with `||` would, and tells whether one was.
   *
   * @throws Error - `MootantHitLimitError` as `hit` does.
   */
  hitAny(ids: readonly string[]): boolean

  /**
   * Drops every `gap` from an array literal that the switched code just built,
   * in place, and returns it. It reads and writes only the own elements and the
   * length of the array, so no code of the array or its prototypes runs.
   */
  cut<Value>(array: Value[]): Value[]

  /**
   * Counts one site evaluation, records the id when `coverage` is set, sets
   * `reached` when `id` is active, and tells whether it is.
   *
   * @throws Error - `MootantHitLimitError` when `hits` exceeds `hitLimit`;
   *   every later call throws too until `hits` is reset.
   */
  hit(id: string): boolean

  /**
   * Iterable of no values, which the switched code spreads in place of a
   * removed spread element; its iterator is its own, so no iterator of the
   * array prototype runs.
   */
  none: Iterable<never>

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

  /**
   * Value the switched code writes in place of a removed array element, which
   * `cut` drops.
   */
  gap: symbol
}
