import type { NodeTestReport } from '../types/node-test-record'

import { REPORTED_KEY } from './reported-key'
import { SERVED_KEY } from './served-key'
import { LOADED_KEY } from './loaded-key'

/**
 * Receivers of the calls that mootant appends to the texts it serves and of the
 * records of mootant's reporter.
 */
interface MarkerReceivers {
  /**
   * Receives a record of mootant's reporter with the error of its test, or
   * undefined.
   */
  reported(record: NodeTestReport, error: unknown): void

  /**
   * Receives the absolute path of a switched file whose switched text ran.
   */
  served(file: string): void

  /**
   * Called when the test file finished evaluating.
   */
  loaded(): void
}

/**
 * Puts the receivers of the calls mootant appends to the texts it serves and of
 * the records of its reporter on `globalThis`, under registered symbols that
 * are not enumerable, so code that lists globals does not see them. A process
 * without them, such as a worker thread, runs the calls as no-ops.
 *
 * @param receivers - Receivers of the calls.
 */
export function installMarkerReceivers(receivers: MarkerReceivers): void {
  for (let [key, value] of [
    [SERVED_KEY, receivers.served],
    [REPORTED_KEY, receivers.reported],
    [LOADED_KEY, receivers.loaded],
  ] as const) {
    Object.defineProperty(globalThis, Symbol.for(key), {
      configurable: true,
      enumerable: false,
      writable: true,
      value,
    })
  }
}
