import { syncBuiltinESMExports } from 'node:module'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Functions of `node:child_process` that start a process; it gets the variables
 * of the worker unless their options name others.
 */
const SPAWNERS = [
  'execFileSync',
  'spawnSync',
  'execFile',
  'execSync',
  'spawn',
  'exec',
  'fork',
]

/**
 * Variables read where no test code asked for them: Node's module loader reads
 * the first two while it loads a module, and Vitest numbers its workers with
 * the others, which differ from worker to worker and are not inputs of a test.
 */
const IGNORED = new Set([
  'WATCH_REPORT_DEPENDENCIES',
  'NODE_V8_COVERAGE',
  'VITEST_WORKER_ID',
  'VITEST_POOL_ID',
])

/**
 * Global slot of the tracking state of the worker process.
 */
const SLOT = Symbol.for('mootant.vitest.environment')

/**
 * Tracking state of a worker process.
 */
interface EnvironmentSlot {
  /**
   * Receiver of the names of the variables read, `*` when code listed them all,
   * or null while nothing records.
   */
  record: ((name: string) => void) | null

  /**
   * Wrapper of every function of `node:child_process` wrapped so far, by the
   * function and by the wrapper itself, so no function is wrapped twice.
   */
  wrappers: WeakMap<Spawner, Spawner>

  /**
   * `process.env` as Node made it, behind the tracking proxy.
   */
  real: NodeJS.ProcessEnv

  /**
   * Whether code listed the variables in the current synchronous run, so the
   * names it reads one by one right after, as spreading or `Object.keys` do,
   * are part of `*` rather than variables it read by name.
   */
  listing: boolean

  /**
   * Whether code made the promisified form of `execFile` or `exec` before the
   * tracking was installed: it starts processes with the variables of the
   * worker without the wrappers, so every receiver gets `*`.
   */
  early: boolean
}

/**
 * Function of `node:child_process` that starts a process.
 */
type Spawner = (...parameters: unknown[]) => unknown

/**
 * Makes the environment variables of the worker report what code reads: puts a
 * proxy in place of `process.env` once per process, and wraps `import.meta.env`
 * of Vitest, which reads `process.env` by name but lists the variables behind
 * it. Reading a variable, asking whether it exists or for its descriptor
 * reports its name; listing the variables, as spreading them does, reports `*`,
 * since the code may depend on all of them, and the names read in the same
 * synchronous run after it are part of that listing and are not reported, so
 * variables left out of `*` do not come back by name. Starting a child process
 * that gets the variables of the worker reports `*` too, since Node may pass
 * them on without reading `process.env`. A promisified `execFile` or `exec`
 * made before the first call, which Node keeps and hands out again, starts
 * processes without the wrappers, so then every receiver gets `*` at once.
 * Variables Node and Vitest read on their own are never reported. Writes go
 * through unchanged and report nothing.
 *
 * @param workerState - Vitest's state of the worker.
 * @param workerState.metaEnv - Object behind `import.meta.env`.
 * @param record - Receives the names while it is the current receiver; the next
 *   call replaces it, and null stops recording.
 * @returns `process.env` as Node made it, which reports nothing.
 */
export function trackEnvironment(
  workerState: { metaEnv: object },
  record: ((name: string) => void) | null,
): NodeJS.ProcessEnv {
  let global = globalThis as { [SLOT]?: EnvironmentSlot }
  let slot = global[SLOT]
  if (slot === undefined) {
    slot = {
      early: ['execFile', 'exec'].some(name => {
        let custom = Reflect.get(
          Reflect.get(childProcess, name) as object,
          promisify.custom,
        ) as object
        return Reflect.get(custom, promisify.custom) === custom
      }),
      wrappers: new WeakMap(),
      real: process.env,
      listing: false,
      record: null,
    }
    global[SLOT] = slot
    process.env = createTracker(slot.real, slot) as NodeJS.ProcessEnv
    for (let name of SPAWNERS) {
      let original = Reflect.get(childProcess, name) as Spawner
      Reflect.set(childProcess, name, wrapSpawner(original, slot))
    }
    syncBuiltinESMExports()
  }
  if (!Reflect.has(workerState.metaEnv, SLOT)) {
    workerState.metaEnv = createTracker(workerState.metaEnv, slot)
  }
  slot.record = record
  if (slot.early) {
    record?.('*')
  }
  return slot.real
}

/**
 * Wraps a function of `node:child_process` so it reports `*` before it starts a
 * process with the variables of the worker: options that are missing or name no
 * `env`, or name `process.env` itself. A function is wrapped once: wrapping it
 * again, or wrapping its wrapper, returns the same wrapper, so a function that
 * names itself as its `util.promisify.custom`, as the result of
 * `util.promisify(execFile)` does, gets a wrapper that names itself.
 *
 * @param original - Function to wrap.
 * @param slot - Tracking state of the worker.
 * @returns Wrapper with the properties of the function, and its
 *   `util.promisify.custom` wrapped too, since it starts the process without
 *   the function.
 */
function wrapSpawner(original: Spawner, slot: EnvironmentSlot): Spawner {
  let known = slot.wrappers.get(original)
  if (known !== undefined) {
    return known
  }
  /**
   * Reports `*` when the process inherits the variables, then calls the
   * function.
   *
   * @param parameters - Arguments of the call.
   * @returns What the function returns.
   */
  function wrapper(this: unknown, ...parameters: unknown[]): unknown {
    let options = parameters
      .slice(1)
      .find(
        (value): value is { env?: unknown } =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      )
    if (
      [process.env, undefined, slot.real, null].includes(options?.env as never)
    ) {
      slot.record?.('*')
    }
    return original.apply(this, parameters)
  }
  slot.wrappers.set(original, wrapper)
  slot.wrappers.set(wrapper, wrapper)
  let descriptors = Object.getOwnPropertyDescriptors(original)
  let custom = (descriptors as Record<symbol, PropertyDescriptor | undefined>)[
    promisify.custom
  ]
  if (typeof custom?.value === 'function') {
    custom.value = wrapSpawner(custom.value as Spawner, slot)
  }
  Object.defineProperties(wrapper, descriptors)
  return wrapper
}

/**
 * Wraps an object of environment variables in a proxy that reports to the
 * receiver of the slot the names read and `*` when they are listed.
 *
 * @param target - Object to wrap.
 * @param slot - Tracking state of the worker.
 * @returns The proxy; it has the slot's symbol, so it is never wrapped twice.
 */
function createTracker(target: object, slot: EnvironmentSlot): object {
  /**
   * Reports a variable read by its name.
   *
   * @param name - Property key read.
   */
  function report(name: string | symbol): void {
    if (typeof name === 'string' && !slot.listing && !IGNORED.has(name)) {
      slot.record?.(name)
    }
  }
  return new Proxy(target, {
    ownKeys: object => {
      slot.record?.('*')
      if (!slot.listing) {
        slot.listing = true
        queueMicrotask(() => {
          slot.listing = false
        })
      }
      return Reflect.ownKeys(object)
    },
    getOwnPropertyDescriptor: (object, name) => {
      report(name)
      return Reflect.getOwnPropertyDescriptor(object, name)
    },
    has: (object, name) => {
      report(name)
      return name === SLOT || Reflect.has(object, name)
    },
    get: (object, name) => {
      report(name)
      return Reflect.get(object, name) as unknown
    },
    set: (object, name, value) => Reflect.set(object, name, value),
  })
}
