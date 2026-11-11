/**
 * Tracking state an environment proxy reads at every trap
 * (`createEnvironmentProxy`).
 */
export interface EnvironmentProxyState {
  /**
   * Receiver of the names of the variables read, `*` when code listed them all,
   * or null while nothing records.
   */
  record: ((name: string) => void) | null

  /**
   * Variables never reported.
   */
  ignored: Set<string>

  /**
   * Whether code listed the variables in the current synchronous run, so the
   * names it reads one by one right after, as spreading or `Object.keys` do,
   * are part of `*` rather than variables it read by name.
   */
  listing: boolean
}
