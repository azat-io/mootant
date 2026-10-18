/**
 * Timer functions of a test process captured before test code could replace
 * them, such as with `vi.useFakeTimers()`.
 */
export interface SafeClock {
  /**
   * Runs a callback after the given milliseconds.
   */
  setTimeout(callback: () => void, delay: number): ReturnType<typeof setTimeout>

  /**
   * Cancels a callback scheduled with `setTimeout`.
   */
  clearTimeout(timer: ReturnType<typeof setTimeout>): void

  /**
   * Runs a callback after pending input and output callbacks.
   */
  setImmediate(callback: () => void): void

  /**
   * Milliseconds since an arbitrary start, never moved by fake timers.
   */
  now(): number
}
