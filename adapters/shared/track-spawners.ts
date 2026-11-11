import { syncBuiltinESMExports } from 'node:module'
import childProcess from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Functions of `node:child_process` that start a process; it gets the variables
 * of the process when the options name no `env`.
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
 * Key of the state on `globalThis`, so the functions are wrapped once in a
 * process, whatever module loads this one.
 */
const SPAWNER_SLOT = Symbol.for('mootant.spawners')

/**
 * What the wrappers of a process report to.
 */
interface SpawnerSlot {
  /**
   * Receives `*` while it is the current receiver, or null.
   */
  record: ((name: string) => void) | null

  /**
   * Wrapper of every function of `node:child_process` wrapped so far, by the
   * function and by the wrapper itself, so no function is wrapped twice.
   */
  wrappers: WeakMap<Spawner, Spawner>

  /**
   * Whether code made the promisified form of `execFile` or `exec` before the
   * functions were wrapped: Node keeps it and hands it out again, and it starts
   * processes with the variables of the process without the wrappers.
   */
  early: boolean

  /**
   * `process.env` as Node made it, which a child gets when the options name it,
   * whatever stands in place of `process.env` now.
   */
  real: object
}

/**
 * Function of `node:child_process` that starts a process.
 */
type Spawner = (...parameters: unknown[]) => unknown

/**
 * Makes the functions of `node:child_process` that start a process report `*`
 * before they start one with the variables of the process: options that are
 * missing or name no `env`, or name `process.env` itself, since Node passes the
 * variables on without reading them where tracking sees it. The functions are
 * wrapped once in a process, with their `util.promisify.custom` too; later
 * calls only replace the receiver. A promisified `execFile` or `exec` made
 * before the first call, as a preload may make and hand to tests through a
 * global, starts processes without the wrappers, which only the caller can make
 * up for; a function a preload put in place of one with no promisified form of
 * its own is wrapped as it is.
 *
 * @param real - `process.env` as Node made it; the one of the first call
 *   applies.
 * @param record - Receives `*` while it is the current receiver; the next call
 *   replaces it, and null stops recording.
 * @returns Whether such a promisified function was made before the first call,
 *   so that any process may get the variables with no word.
 */
export function trackSpawners(
  real: object,
  record: ((name: string) => void) | null,
): boolean {
  let global = globalThis as { [SPAWNER_SLOT]?: SpawnerSlot }
  let slot = global[SPAWNER_SLOT]
  if (slot === undefined) {
    slot = {
      early: ['execFile', 'exec'].some(name => {
        let custom: unknown = Reflect.get(
          Reflect.get(childProcess, name) as object,
          promisify.custom,
        )
        return (
          typeof custom === 'function' &&
          Reflect.get(custom, promisify.custom) === custom
        )
      }),
      wrappers: new WeakMap(),
      record: null,
      real,
    }
    global[SPAWNER_SLOT] = slot
    for (let name of SPAWNERS) {
      let original = Reflect.get(childProcess, name) as Spawner
      Reflect.set(childProcess, name, wrapSpawner(original, slot))
    }
    syncBuiltinESMExports()
  }
  slot.record = record
  return slot.early
}

/**
 * Wraps a function of `node:child_process` so it reports `*` before it starts a
 * process with the variables of the process. A function is wrapped once:
 * wrapping it again, or wrapping its wrapper, returns the same wrapper, so a
 * function that names itself as its `util.promisify.custom`, as the result of
 * `util.promisify(execFile)` does, gets a wrapper that names itself.
 *
 * @param original - Function to wrap.
 * @param slot - What the wrappers report to.
 * @returns Wrapper with the properties of the function, and its
 *   `util.promisify.custom` wrapped too, since it starts the process without
 *   the function.
 */
function wrapSpawner(original: Spawner, slot: SpawnerSlot): Spawner {
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
