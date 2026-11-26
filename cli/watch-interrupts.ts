import { constants } from 'node:os'

import { removeLiveWorkDirectories } from '../core/run/remove-live-work-directories'

/**
 * Signals that interrupt a run: a closed terminal, Ctrl+C and a request to
 * stop, such as from a process manager or an agent.
 */
const SIGNALS: NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM']

/**
 * Milliseconds an interrupted run gets to stop its test processes, close the
 * test runner and remove its files before the process ends anyway.
 */
const CLEANUP_LIMIT = 5000

/**
 * Watch of the signals that interrupt a run.
 */
interface Interrupts {
  /**
   * Aborted on the first signal.
   */
  signal: AbortSignal

  /**
   * Ends the watch once the run is over. Without a signal, it removes the
   * listeners of the watch and returns false. After a signal, it ends the
   * process by that signal, as the process would end without the listeners;
   * where the signal does not end it, on Windows, which cannot raise a signal
   * again, or while another listener of the signal remains, it exits with the
   * code a shell gives for the signal, 128 plus its number.
   *
   * @returns False when no signal came.
   */
  end(): boolean
}

/**
 * Watches SIGHUP, SIGINT and SIGTERM for a run, so that it can stop its test
 * processes and remove its files before the process ends. The first signal sets
 * the exit code a shell gives for it, 128 plus its number, and aborts the
 * returned signal; later ones are ignored while the run cleans up, since npm
 * and other wrappers send the terminal's SIGINT a second time. The cleanup gets
 * 5 seconds: past them, such as when a global teardown hangs, the work
 * directories of the run are removed at once (`removeLiveWorkDirectories`) and
 * the process ends by the signal anyway. They are removed too when something
 * else ends the process meanwhile, such as a listener of the project's code
 * that exits. The listeners stay until the process ends, as a listener that
 * removed itself would let other listeners raise the signal again before the
 * cleanup. SIGQUIT, the quit key, keeps ending the process at once. Errors of
 * writes to standard error are ignored from the start: after a terminal closed
 * a write fails with EIO, which would otherwise end the process before the run
 * cleaned up.
 *
 * @returns The watch, with the signal to pass to the run.
 */
export function watchInterrupts(): Interrupts {
  let controller = new AbortController()
  let received: NodeJS.Signals | null = null
  let timer: NodeJS.Timeout | undefined
  /**
   * Notes the first signal and aborts the run, which gets until the cleanup
   * limit to end.
   *
   * @param signal - Signal this process got.
   */
  function interrupt(signal: NodeJS.Signals): void {
    if (received === null) {
      received = signal
      process.exitCode = 128 + constants.signals[signal]
      timer = setTimeout(() => {
        removeLiveWorkDirectories()
        stop(signal)
      }, CLEANUP_LIMIT)
      controller.abort()
    }
  }
  /**
   * Ends the process by the signal it got, else with its exit code.
   *
   * @param signal - Signal this process got.
   */
  function stop(signal: NodeJS.Signals): void {
    clearTimeout(timer)
    for (let each of SIGNALS) {
      process.off(each, interrupt)
    }
    if (process.platform !== 'win32') {
      process.kill(process.pid, signal)
    }
    // eslint-disable-next-line unicorn/no-process-exit -- Reached only after a signal that did not end the process.
    process.exit()
  }
  /**
   * Ignores an error of a write to standard error.
   */
  function ignore(): void {}
  process.stderr.on('error', ignore)
  process.on('exit', removeLiveWorkDirectories)
  for (let signal of SIGNALS) {
    process.on(signal, interrupt)
  }
  return {
    end: () => {
      if (received !== null) {
        stop(received)
        return true
      }
      for (let signal of SIGNALS) {
        process.off(signal, interrupt)
      }
      process.off('exit', removeLiveWorkDirectories)
      process.stderr.off('error', ignore)
      return false
    },
    signal: controller.signal,
  }
}
