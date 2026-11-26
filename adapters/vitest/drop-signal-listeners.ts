/**
 * Signals whose listeners Vitest and Vite add as Vitest starts.
 */
const SIGNALS = new Set<string | symbol>(['SIGTERM', 'SIGINT'])

/**
 * Runs a start and drops every listener of SIGINT or SIGTERM added meanwhile,
 * right after it is added. Vitest adds its own as it is created, and Vite one
 * for a server out of middleware mode; they end the process soon after the
 * signal, before mootant could stop the workers and close Vitest, which removes
 * its temporary files, so the command line handles these signals itself. A
 * listener is dropped in a microtask, which always runs before the process can
 * handle a signal. Those the project's configuration and plugins add meanwhile
 * are dropped too, as nothing tells them apart; listeners added later stay.
 *
 * @param start - Start to run.
 * @returns What the start gives.
 */
export async function dropSignalListeners<Result>(
  start: () => Promise<Result>,
): Promise<Result> {
  /**
   * Drops a listener of SIGINT or SIGTERM once it is added.
   *
   * @param event - Event the listener is added for.
   * @param listener - Function added for the event.
   */
  function drop(
    event: string | symbol,
    listener: (...values: unknown[]) => void,
  ): void {
    if (SIGNALS.has(event)) {
      queueMicrotask(() => {
        process.off(event, listener)
      })
    }
  }
  process.on('newListener', drop)
  try {
    return await start()
  } finally {
    process.off('newListener', drop)
  }
}
