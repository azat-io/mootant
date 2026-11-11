import type { JestGlobalConfig } from './jest-global-config'
import type { JestTestRunner } from './jest-test-runner'
import type { BootedProject } from './booted-project'
import type { WorkerChannel } from './worker-channel'
import type { WorkerProcess } from './worker-process'
import type { WorkerCalls } from './worker-calls'

/**
 * What a worker's boot hands every unit.
 */
export interface UnitWorker {
  /**
   * What the reads of a unit count, besides those under `node_modules` and
   * mootant's own files.
   */
  reads: {
    /**
     * Extensions, without the dot, of the files that count wherever they are
     * but in a temporary directory.
     */
    extensions: ReadonlySet<string>

    /**
     * Absolute directories whose files count.
     */
    directories: readonly string[]

    /**
     * The temporary directory as Node gives it and, when it exists, as its real
     * path, whose files count only under a directory of the session.
     */
    temporary: readonly string[]
  }

  /**
   * `BufferedConsole` of the `@jest/console` that `jest-runner` makes the
   * console of tests from.
   */
  BufferedConsole: {
    /**
     * Keeps an entry of what a test printed in the buffer of a console, with
     * the stack of the call as its origin; every method of the console calls it
     * through the class.
     */
    write(buffer: object[], type: string, message: string): object[]
  }

  /**
   * The class of `jest-resolve`, for its file cache.
   */
  Resolver: {
    /**
     * Forgets what the default resolver read of the disk.
     */
    clearDefaultResolverCache(): void
  }

  /**
   * What the worker knows of its units so far.
   */
  flags: {
    /**
     * Whether an error of a unit that ended showed up in the current unit.
     */
    stale: boolean
  }

  /**
   * `getConsoleOutput` of `@jest/console`: what Jest's reporters show of the
   * entries of a console that kept what tests printed.
   */
  getConsoleOutput(
    buffer: object[],
    config: object,
    globalConfig: object,
  ): string

  /**
   * `TestRunner` of `jest-runner`.
   */
  TestRunner: new (globalConfig: object, context: object) => JestTestRunner

  /**
   * `require.cache` of the worker: the CommonJS modules of its own realm, among
   * them the transformers, test environment and resolver of a project with what
   * they import, which a worker loads once and its later units never read. ES
   * modules are never in it, and of a `require` of one only that module is.
   */
  requireCache: Readonly<Record<string, unknown>>

  /**
   * Projects of the session by id.
   */
  projects: ReadonlyMap<string, BootedProject>

  /**
   * Compares what units of a worker share with the baseline of the boot.
   */
  checkState(): Promise<string[]>

  /**
   * Global configuration.
   */
  globalConfig: JestGlobalConfig

  /**
   * Ids of the sites that ran in the worker's own realm.
   */
  outside: ReadonlySet<string>

  /**
   * Clears the marks and measures of the worker's `performance`, with the
   * functions it had at boot, as a later run of a test may count them.
   */
  clearPerformance(): void

  /**
   * The worker's process.
   */
  process: WorkerProcess

  /**
   * Channel of the worker.
   */
  channel: WorkerChannel

  /**
   * Disables every `AsyncLocalStorage` enabled during the unit.
   */
  disableStores(): void

  /**
   * `Error` of the vm of every unit that ended.
   */
  dead: WeakSet<object>

  /**
   * Calls into the resolvers and transformers of the projects that run, which
   * tell what they read apart from what tests read.
   */
  calls: WorkerCalls

  /**
   * Real path of the directory of mootant's Jest files.
   */
  directory: string

  /**
   * Whether the reads of a unit hold every file read through `node:fs`: not
   * when graceful-fs loaded before the read tracker, as through a `--require`
   * in `NODE_OPTIONS`, since it keeps copies of the functions it found.
   */
  tracked: boolean

  /**
   * Whether a promisified `execFile` or `exec` was made before the worker
   * wrapped what starts a process, as a `--require` preload may make one and
   * hand it to tests through a global: it starts processes with the variables
   * of the worker without the wrappers, so every unit depends on all of them.
   */
  early: boolean

  /**
   * `JEST_WORKER_ID` of the worker.
   */
  slot: string
}
