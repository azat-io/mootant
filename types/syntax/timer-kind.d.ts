/**
 * Timer that a call resolves to, before its arguments are read.
 */
export interface TimerKind {
  /**
   * Whether the timer returns a promise or an async iterator of
   * `node:timers/promises`, rather than calling a callback.
   */
  promise: boolean

  /**
   * Name of the timer: `setTimeout`, `setInterval` or `wait` of the scheduler.
   */
  name: string
}
