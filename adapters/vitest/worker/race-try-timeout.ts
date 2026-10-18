import type { SafeClock } from '../../shared/types/safe-clock'

/**
 * How a test function settled: null when it resolved, else what it threw.
 */
type Settled = { error: unknown } | null

/**
 * Runs a test function against mootant's own timer. When the timer fires first,
 * the function keeps running in the background and its later failure is
 * ignored; the worker abandons the rest of its unit.
 *
 * @param run - Test function.
 * @param timeout - Milliseconds allowed.
 * @param clock - Timers captured before test code could replace them.
 * @returns Whether the timer fired before the function settled.
 * @throws {unknown} What the function threw or rejected with in time.
 */
export async function raceTryTimeout(
  run: () => unknown,
  timeout: number,
  clock: SafeClock,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = new Promise<'expired'>(resolve => {
    timer = clock.setTimeout(() => {
      resolve('expired')
    }, timeout)
  })
  let running = (async (): Promise<Settled> => {
    try {
      await run()
      return null
    } catch (error) {
      return { error }
    }
  })()
  let first = await Promise.race([running, expired])
  clock.clearTimeout(timer!)
  if (first === 'expired') {
    return true
  }
  if (first !== null) {
    throw first.error
  }
  return false
}
