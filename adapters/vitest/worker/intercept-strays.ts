/**
 * Receiver of the unhandled errors Vitest reports in one worker state.
 */
interface StraySlot {
  /**
   * Receiver of the file that runs now.
   */
  receive: StrayReceiver
}

/**
 * Records an unhandled error as Vitest's listener reports it.
 *
 * @param error - Error as Vitest serialized it, or a reason that is not an
 *   object.
 * @param type - Event of the error, as Vitest names it.
 */
type StrayReceiver = (error: unknown, type: string) => void

/**
 * Key of the slot on Vitest's worker state that keeps one wrapper of the
 * state's RPC.
 */
const STRAY_SLOT = Symbol.for('mootant.vitest.strays')

/**
 * Takes over Vitest's report of a worker's unhandled errors. Vitest's own
 * listener of the process leaves an error to the code when another listener of
 * its event exists, as in a plain run; otherwise it serializes the error and
 * passes it to `onUnhandledError` of the RPC it reads from the worker state at
 * that moment. That RPC is wrapped once per worker state: the call goes to the
 * receiver instead of the main process, synchronously, so the error lands in
 * the try that runs at that moment, and every other call passes through. A
 * later receiver on the same state takes the wrapper over. No listener of the
 * process is added, which would make Vitest's step aside.
 *
 * @param state - Vitest's worker state.
 * @param receive - Records an unhandled error.
 */
export function interceptStrays(
  state: { rpc: object },
  receive: StrayReceiver,
): void {
  let slot = Reflect.get(state, STRAY_SLOT) as StraySlot | undefined
  if (slot === undefined) {
    let created: StraySlot = { receive }
    /**
     * Passes an unhandled error to the current receiver.
     *
     * @param error - Error as Vitest serialized it, or a reason that is not an
     *   object.
     * @param type - Event of the error, as Vitest names it.
     */
    function report(error: unknown, type: string): void {
      created.receive(error, type)
    }
    state.rpc = new Proxy(state.rpc, {
      get: (target, key): unknown =>
        key === 'onUnhandledError' ? report : Reflect.get(target, key),
    })
    Reflect.set(state, STRAY_SLOT, created)
    slot = created
  }
  slot.receive = receive
}
