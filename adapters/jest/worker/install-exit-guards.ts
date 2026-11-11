import { getErrorMessage } from '../../shared/get-error-message'

/**
 * What the guards use of the worker's process.
 */
interface GuardedProcess {
  /**
   * Adds a listener.
   */
  on(event: string, listener: (error: unknown) => void): unknown

  /**
   * Removes every listener of an event.
   */
  removeAllListeners(event: string): unknown

  /**
   * Standard error.
   */
  stderr: { write(text: string): unknown }

  /**
   * Ends the process.
   */
  exit(code: number): unknown
}

/**
 * Leaves the worker with only mootant's listeners for errors nothing caught.
 * Circus strips the listeners of `uncaughtException` and `unhandledRejection`
 * and restores only what it read from the vm's copy, so after a load failure
 * dead listeners stay. The guard ends the worker, since nothing owns such an
 * error.
 *
 * @param target - The worker's process.
 */
export function installExitGuards(target: GuardedProcess): void {
  target.removeAllListeners('uncaughtException')
  target.removeAllListeners('unhandledRejection')
  target.removeAllListeners('rejectionHandled')

  /**
   * Reports the error and ends the worker.
   *
   * @param error - Value nothing caught.
   */
  function guard(error: unknown): void {
    target.stderr.write(
      `mootant: an error outside any test: ${getErrorMessage(error)}\n`,
    )
    target.exit(1)
  }

  target.on('uncaughtException', guard)
  target.on('unhandledRejection', guard)
}
