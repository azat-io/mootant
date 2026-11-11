import type { EnvironmentProxyState } from './types/environment-proxy-state'

import { createEnvironmentProxy } from './create-environment-proxy'
import { ENVIRONMENT_SLOT } from './environment-slot'
import { trackSpawners } from './track-spawners'

/**
 * Variables Node's module loader reads while it loads a module, where no test
 * code asked for them.
 */
const LOADER_VARIABLES = ['WATCH_REPORT_DEPENDENCIES', 'NODE_V8_COVERAGE']

/**
 * What the tracking of a test process covers besides `process.env`.
 */
interface EnvironmentOptions {
  /**
   * Object whose `metaEnv` lists variables behind `process.env`, such as
   * Vitest's worker state with `import.meta.env`; its `metaEnv` is replaced
   * with a tracking proxy once. Omitted by test runners without one.
   */
  holder?: { metaEnv: object }

  /**
   * Variables the test runner reads on its own, which differ from process to
   * process and are not inputs of a test; never reported.
   */
  ignored: Iterable<string>
}

/**
 * Tracking state of a test process.
 */
interface EnvironmentSlot extends EnvironmentProxyState {
  /**
   * `process.env` as Node made it, behind the tracking proxy.
   */
  real: NodeJS.ProcessEnv
}

/**
 * Makes the environment variables of a test process report what code reads:
 * puts a proxy in place of `process.env` once per process, and wraps the
 * `metaEnv` of the holder, such as `import.meta.env` of Vitest, which reads
 * `process.env` by name but lists the variables behind it. Reading a variable,
 * asking whether it exists or for its descriptor reports its name; listing the
 * variables, as spreading them does, reports `*`, since the code may depend on
 * all of them, and the names read in the same synchronous run after it are part
 * of that listing and are not reported, so variables left out of `*` do not
 * come back by name. Starting a child process that gets the variables of the
 * process reports `*` too, since Node may pass them on without reading
 * `process.env` (`trackSpawners`). A promisified `execFile` or `exec` made
 * before the first call, which Node keeps and hands out again, starts processes
 * without the wrappers, so then every receiver gets `*` at once. Variables
 * Node's module loader reads and those the test runner names as ignored are
 * never reported. Writes go through unchanged and report nothing.
 *
 * @param options - Holder of `metaEnv`, if any, and the variables to ignore;
 *   the ignored ones of the latest call apply.
 * @param record - Receives the names while it is the current receiver; the next
 *   call replaces it, and null stops recording.
 * @returns `process.env` as Node made it, which reports nothing.
 */
export function trackEnvironment(
  options: EnvironmentOptions,
  record: ((name: string) => void) | null,
): NodeJS.ProcessEnv {
  let global = globalThis as { [ENVIRONMENT_SLOT]?: EnvironmentSlot }
  let slot = global[ENVIRONMENT_SLOT]
  if (slot === undefined) {
    slot = {
      ignored: new Set(),
      real: process.env,
      listing: false,
      record: null,
    }
    global[ENVIRONMENT_SLOT] = slot
    process.env = createEnvironmentProxy(slot.real, slot) as NodeJS.ProcessEnv
  }
  let early = trackSpawners(slot.real, record)
  slot.ignored = new Set([...LOADER_VARIABLES, ...options.ignored])
  let { holder } = options
  if (holder !== undefined && !Reflect.has(holder.metaEnv, ENVIRONMENT_SLOT)) {
    holder.metaEnv = createEnvironmentProxy(holder.metaEnv, slot)
  }
  slot.record = record
  if (early) {
    record?.('*')
  }
  return slot.real
}
