import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { CacheInputs } from '../../types/adapter/cache-inputs'
import type { Diagnostic } from '../../types/mutant/diagnostic'

/**
 * Wraps the session of a run so that an interrupted run asks nothing more of
 * the test runner: once the signal aborted, a call throws the signal's reason
 * without starting, and a call that was running throws it when it ends,
 * dropping what it gave, so verdicts of units the interrupt stopped never
 * count. A running call is awaited, not cut short: the adapter ends it
 * (`AdapterContext.signal`), so `close` never runs alongside it and no
 * rejection is left unhandled. `close` passes through. The facts of the session
 * (`diagnostics`, `version`, `workers`) and whether it has `cacheInputs` are
 * read from the session itself each time, so a session that keeps them in
 * getters of its class or changes them later reads the same through the guard.
 *
 * @param session - Session the adapter started.
 * @param signal - Signal that interrupts the run.
 * @returns The guarded session.
 */
export function guardSession(
  session: AdapterSession,
  signal: AbortSignal,
): AdapterSession {
  /**
   * Makes a call of the session unless the run is interrupted, and drops what
   * it gives if the run was interrupted meanwhile.
   *
   * @param call - Call of the session.
   * @returns What the call gives.
   * @throws The reason of the signal once it aborted.
   */
  async function guard<Result>(call: () => Promise<Result>): Promise<Result> {
    signal.throwIfAborted()
    try {
      return await call()
    } finally {
      signal.throwIfAborted()
    }
  }
  return {
    get cacheInputs(): (() => Promise<CacheInputs>) | undefined {
      return session.cacheInputs === undefined ?
          undefined
        : () => guard(() => session.cacheInputs!())
    },
    get diagnostics(): readonly Diagnostic[] | undefined {
      return session.diagnostics
    },
    get version(): undefined | string {
      return session.version
    },
    get workers(): undefined | number {
      return session.workers
    },
    runIsolated: plan => guard(() => session.runIsolated(plan)),
    listTestFiles: () => guard(() => session.listTestFiles()),
    dryRun: request => guard(() => session.dryRun(request)),
    runBatch: plan => guard(() => session.runBatch(plan)),
    close: () => session.close(),
  }
}
