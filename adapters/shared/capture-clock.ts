import type { SafeClock } from './types/safe-clock'

/**
 * Captures the timer functions of the test process as they are now. Mootant's
 * code in the process calls it when its module loads, before setup files and
 * tests run, so fake timers installed later, such as with `vi.useFakeTimers()`
 * or `mock.timers.enable()`, can neither fire nor delay mootant's own timers,
 * and moving the system time does not change them.
 *
 * @returns Timer functions bound to their original implementations.
 */
export function captureClock(): SafeClock {
  let {
    setImmediate: immediate,
    setTimeout: schedule,
    clearTimeout: clear,
  } = globalThis
  let now = performance.now.bind(performance)
  return {
    setImmediate: callback => {
      immediate(callback)
    },
    setTimeout: (callback, delay) => schedule(callback, delay),
    clearTimeout: timer => {
      clear(timer)
    },
    now,
  }
}
