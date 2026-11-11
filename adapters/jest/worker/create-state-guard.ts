import { compareCodeUnits } from '../../../core/compare-code-units'

/**
 * Core modules a test can change for every later unit of a worker.
 */
const CORE_MODULES = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'crypto',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tty',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib',
]

/**
 * Resources that a test can leave behind, such as a server on a fixed port.
 */
const RESOURCES = ['TCPServerWrap', 'PipeWrap', 'PipeServerWrap', 'ProcessWrap']

/**
 * What the guard reads of the worker's process.
 */
interface GuardInput {
  /**
   * The worker's process.
   */
  process: {
    /**
     * Gives a core module.
     */
    getBuiltinModule(name: string): undefined | object

    /**
     * Lists the kinds of what keeps the event loop alive, one item each.
     */
    getActiveResourcesInfo(): string[]

    /**
     * Gives the mask of new files.
     */
    umask(): number

    /**
     * Standard output, whose pipe exists once it is read.
     */
    stdout: unknown

    /**
     * Standard error, whose pipe exists once it is read.
     */
    stderr: unknown

    /**
     * Gives the working directory.
     */
    cwd(): string
  }

  /**
   * Schedules a callback for the next turn of the event loop, captured by the
   * caller before any test code ran.
   */
  setImmediate(callback: () => void): unknown
}

/**
 * Takes a baseline of what units of a worker share: the own properties of core
 * modules, the working directory, the mask of new files and the resources a
 * test can leave. Creating it is the last step of a worker's boot, after what
 * refs the IPC pipe, and reads `stdout` and `stderr` first so their pipes are
 * in the baseline.
 *
 * @param input - The worker's process and how to wait for a turn.
 * @returns Function that waits two turns of the event loop, since a server
 *   closed properly stays listed until uv's closing phase, and gives the sorted
 *   reasons the worker is no longer clean: `cwd`, `umask`, `<module>.<key>` for
 *   a new, changed or deleted key, and `<resource> +<n>` for a count that
 *   rose.
 */
export function createStateGuard(input: GuardInput): () => Promise<string[]> {
  let { process: target } = input
  Reflect.get(target, 'stdout')
  Reflect.get(target, 'stderr')
  let modules = CORE_MODULES.map(name => {
    let owner = target.getBuiltinModule(name)!
    return { descriptors: readDescriptors(owner), owner, name }
  })
  let directory = target.cwd()
  let mask = target.umask()
  let resources = countResources(target.getActiveResourcesInfo())

  /**
   * Waits for one turn of the event loop.
   *
   * @returns A promise that settles on the next turn.
   */
  function waitTurn(): Promise<void> {
    return new Promise(resolve => {
      input.setImmediate(resolve)
    })
  }

  return async () => {
    await waitTurn()
    await waitTurn()
    let reasons: string[] = []
    if (target.cwd() !== directory) {
      reasons.push('cwd')
    }
    if (target.umask() !== mask) {
      reasons.push('umask')
    }
    for (let { descriptors, owner, name } of modules) {
      let current = readDescriptors(owner)
      let keys = new Set([...descriptors.keys(), ...current.keys()])
      for (let key of keys) {
        if (isChanged(descriptors.get(key), current.get(key), owner)) {
          reasons.push(`${name}.${String(key)}`)
        }
      }
    }
    let counts = countResources(target.getActiveResourcesInfo())
    for (let [index, resource] of RESOURCES.entries()) {
      let rise = counts[index]! - resources[index]!
      if (rise > 0) {
        reasons.push(`${resource} +${rise}`)
      }
    }
    return reasons.toSorted(compareCodeUnits)
  }
}

/**
 * Tells whether a key of a core module differs from the baseline. A getter
 * replaced by the value it returns is no change: Node's lazy properties replace
 * themselves.
 *
 * @param before - Descriptor in the baseline, if the key was there.
 * @param after - Descriptor now, if the key is there.
 * @param owner - The module.
 * @returns Whether the key counts as changed.
 */
function isChanged(
  before: PropertyDescriptor | undefined,
  after: PropertyDescriptor | undefined,
  owner: object,
): boolean {
  if (before === undefined || after === undefined) {
    return true
  }
  if (
    before.value === after.value &&
    before.get === after.get &&
    before.set === after.set
  ) {
    return false
  }
  return (
    before.get === undefined ||
    !Object.hasOwn(after, 'value') ||
    before.get.call(owner) !== after.value
  )
}

/**
 * Reads the own properties of a module without running its getters.
 *
 * @param owner - The module.
 * @returns Descriptors by key.
 */
function readDescriptors(
  owner: object,
): Map<string | symbol, PropertyDescriptor> {
  return new Map(
    Reflect.ownKeys(owner).map(key => [
      key,
      Reflect.getOwnPropertyDescriptor(owner, key)!,
    ]),
  )
}

/**
 * Counts the resources a test can leave.
 *
 * @param listed - What the process lists as active.
 * @returns Count of each of `RESOURCES`, in its order.
 */
function countResources(listed: string[]): number[] {
  return RESOURCES.map(
    resource => listed.filter(item => item === resource).length,
  )
}
