import type { MutantRuntime } from '../../../types/adapter/mutant-runtime'
import type { WorkerChannel } from '../types/worker-channel'
import type { VmSide } from '../types/vm-side'

import { createEnvironmentProxy } from '../../shared/create-environment-proxy'
import { RUNTIME_GLOBAL } from '../../../core/runtime/runtime-global'

/**
 * Timer functions of a vm, each with the function that clears its handles.
 */
const TIMERS = [
  ['setTimeout', 'clearTimeout'],
  ['setInterval', 'clearInterval'],
  ['setImmediate', 'clearImmediate'],
] as const

/**
 * What the setup of a test's vm works with.
 */
interface VmSideInput {
  /**
   * The vm's `globalThis`, with its timers beside these.
   */
  target: { process: { env: object }; Error: ErrorConstructor }

  /**
   * Installs the mutant runtime of the vm.
   */
  install(): MutantRuntime

  /**
   * Channel of the worker.
   */
  channel: WorkerChannel
}

/**
 * Sets up a test's vm before any project code, and registers on the channel
 * what the worker reads and stops once the unit ended; it registers last, so a
 * worker that sees no side knows the setup never ran. The file does not change
 * how a timer behaves, and fake timers pass around the wrappers. Nothing is
 * ignored in the environment: Node's loader reads the real `process.env`, not
 * this one.
 *
 * @param input - What the setup works with.
 */
export function installVmSide(input: VmSideInput): void {
  let { channel, install, target } = input
  let { token } = channel
  let unit = channel.unit!
  // Jest's node environment copies the worker's globals as it loads, the stub
  // in `__mootant` too, and `install` would keep that as a runtime.
  Reflect.deleteProperty(target, RUNTIME_GLOBAL)
  let runtime = install()
  Object.defineProperty(target, RUNTIME_GLOBAL, {
    configurable: true,
    enumerable: false,
    value: runtime,
    writable: true,
  })
  // Jest 30's cleanup of a vm's globals spares what carries this mark.
  Reflect.set(runtime, Symbol.for('$$jest-protect-from-deletion'), true)

  let { hit } = runtime
  let reached = false
  let closed = false
  runtime.hit = id => {
    if (closed) {
      return false
    }
    let active = hit(id)
    if (active && !reached) {
      reached = true
      // The only durable proof of a reach, so it cannot wait.
      channel.write(token, { hits: runtime.hits, kind: 'reached' })
    }
    return active
  }

  let stops: (() => void)[] = []
  for (let names of TIMERS) {
    wrapTimer(target, names, stops)
  }

  let seen = new Set<string>()
  target.process.env = createEnvironmentProxy(target.process.env, {
    record: name => {
      seen.add(name)
    },
    ignored: new Set(),
    listing: false,
  })

  runtime.active = unit.mutant
  runtime.hitLimit = unit.hitLimit ?? Infinity
  runtime.coverage = unit.mutant === null ? new Set() : null

  let side: VmSide = {
    stopTimers() {
      for (let stop of stops.splice(0)) {
        stop()
      }
    },
    addVariable(name) {
      seen.add(name)
    },
    close() {
      closed = true
    },
    listVariables: () => [...seen],
    realmError: target.Error,
    isReached: () => reached,
    runtime,
  }
  channel.vm = side
}

/**
 * Replaces a timer function of the vm, if it has it (jsdom has no
 * `setImmediate`) and the function that clears its handles, with one that
 * remembers how to clear each handle and keeps the original's own properties,
 * above all `util.promisify.custom`.
 *
 * @param target - The vm's `globalThis`.
 * @param names - Names of the function and of the one that clears its handles.
 * @param stops - Receives a function that clears each handle.
 */
function wrapTimer(
  target: object,
  names: readonly [string, string],
  stops: (() => void)[],
): void {
  let [startName, clearName] = names
  let start = Reflect.get(target, startName) as
    ((...parameters: unknown[]) => unknown) | undefined
  let clear = Reflect.get(target, clearName) as
    ((handle: unknown) => void) | undefined
  if (start === undefined || clear === undefined) {
    return
  }

  /**
   * Starts the timer and remembers its handle.
   *
   * @param parameters - Arguments of the call.
   * @returns The handle.
   */
  function wrapper(this: unknown, ...parameters: unknown[]): unknown {
    let handle = start!.apply(this, parameters)
    stops.push(() => {
      clear!.call(target, handle)
    })
    return handle
  }

  let { prototype, length, name, ...own } =
    Object.getOwnPropertyDescriptors(start)
  Object.defineProperties(wrapper, own)
  Reflect.set(target, startName, wrapper)
}
