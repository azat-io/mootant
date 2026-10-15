/**
 * Tracing helper of a Vitest worker: every step of the worker runs through its
 * `$` method, named after the step.
 */
interface WorkerTraces {
  /**
   * Runs a step of the worker inside a span named after it.
   */
  $(name: string, ...rest: unknown[]): unknown
}

/**
 * Reaction to the end of the worker's teardown: gets the error the teardown
 * threw, or null when it finished.
 */
type CloseListener = (failure: { error: unknown } | null) => void

/**
 * Key of the listeners kept on the worker's tracing helper.
 */
const CLOSE_LISTENERS = Symbol.for('mootant.vitest.close')

/**
 * Name of the step Vitest runs a worker's teardown in when it stops the worker:
 * the cleanup listeners, such as the cleanup of the worker-scoped fixtures,
 * then the teardown of the test environment. An error of the cleanup listeners
 * is returned; an error of the environment's teardown is thrown.
 */
const TEARDOWN_STEP = 'vitest.runtime.teardown'

/**
 * Watches the end of the teardown of a Vitest worker, which tears the test
 * environment down after the cleanup listeners ran. The worker's tracing helper
 * is wrapped once per process; every listener is called once, when the teardown
 * step finished, with the error the step threw, such as an error of the
 * environment's teardown, or null. Errors are passed on unchanged.
 *
 * @param traces - Tracing helper of the worker, `workerState.ctx.traces`.
 * @returns Adds a listener for the end of the teardown, or null when the worker
 *   has no tracing helper to watch.
 */
export function watchWorkerClose(
  traces: unknown,
): ((listener: CloseListener) => void) | null {
  if (
    typeof traces !== 'object' ||
    traces === null ||
    typeof (traces as Partial<WorkerTraces>).$ !== 'function'
  ) {
    return null
  }
  let helper = traces as WorkerTraces
  let listeners = Reflect.get(helper, CLOSE_LISTENERS) as
    Set<CloseListener> | undefined
  if (listeners === undefined) {
    let created = new Set<CloseListener>()
    /**
     * Calls the listeners once and forgets them.
     *
     * @param failure - Error of the teardown, or null.
     */
    function settle(failure: { error: unknown } | null): void {
      let called = [...created]
      created.clear()
      for (let listener of called) {
        listener(failure)
      }
    }
    let original = helper.$
    helper.$ = (name: string, ...rest: unknown[]): unknown => {
      let result: unknown = Reflect.apply(original, helper, [name, ...rest])
      return name === TEARDOWN_STEP ? awaitTeardown(result, settle) : result
    }
    Reflect.set(helper, CLOSE_LISTENERS, created)
    listeners = created
  }
  let target = listeners
  return listener => {
    target.add(listener)
  }
}

/**
 * Waits for the teardown step of a worker and reports how it ended.
 *
 * @param step - What the teardown step returned.
 * @param settle - Gets the error the step threw, or null.
 * @returns What the step resolved with.
 * @throws {unknown} The error of the step, unchanged.
 */
async function awaitTeardown(
  step: unknown,
  settle: (failure: { error: unknown } | null) => void,
): Promise<unknown> {
  let value: unknown
  try {
    value = await step
  } catch (error) {
    settle({ error })
    throw error
  }
  settle(null)
  return value
}
