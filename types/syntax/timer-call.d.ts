/**
 * Call of a timer that the delay rule knows: a callback timer such as
 * `setTimeout(run, 100)`, or a promise timer of `node:timers/promises` such as
 * `setTimeout(100)` and `scheduler.wait(100)`.
 */
export interface TimerCall {
  /**
   * Whether the call returns a promise that settles after the delay with a
   * value that is not a thenable, so that awaiting it only waits.
   */
  waits: boolean

  /**
   * Index of the argument that is the delay: 1 for a callback timer, 0 for a
   * promise timer.
   */
  delay: number
}
