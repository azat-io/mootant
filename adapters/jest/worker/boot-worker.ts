import { readFileSync, realpathSync, existsSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import { setFlagsFromString } from 'node:v8'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestModuleMap } from '../types/jest-module-map'
import type { WorkerSession } from '../types/worker-session'
import type { WorkerProcess } from '../types/worker-process'
import type { BootedProject } from '../types/booted-project'
import type { WorkerCalls } from '../types/worker-calls'
import type { UnitWorker } from '../types/unit-worker'
import type { JestUnit } from '../types/jest-unit'

import { countDefaultResolverCalls } from './count-default-resolver-calls'
import { createTransformerFactory } from './create-transformer-factory'
import { RUNTIME_GLOBAL } from '../../../core/runtime/runtime-global'
import { getErrorMessage } from '../../shared/get-error-message'
import { trackFileReads } from '../../shared/track-file-reads'
import { createWorkerChannel } from './create-worker-channel'
import { countResolverCalls } from './count-resolver-calls'
import { trackSpawners } from '../../shared/track-spawners'
import { installExitGuards } from './install-exit-guards'
import { createStateGuard } from './create-state-guard'
import { createTestRunner } from './create-test-runner'
import { CHANNEL_SLOT } from './channel-slot'
import { trackStores } from './track-stores'
import { runUnit } from './run-unit'

/**
 * Key of what `test-runner.cjs` and `transformer.cjs` export on the worker's
 * global, so they share one module instance with the worker: a second copy
 * would silently break what is kept in closures, such as stale detection.
 */
const WORKER_SLOT = Symbol.for('mootant.worker')

/**
 * Units a worker runs with `--experimental-vm-modules` before it ends. In that
 * mode the vm context of every unit stays in the worker, about 10 MB a unit on
 * a graph of 400 modules, so a worker that runs on dies at its heap limit and
 * the limit climbs; after 20 such units it holds about 350 MB, well under the
 * first limit of 512 MB.
 */
const VM_MODULE_UNITS = 20

/**
 * `setImmediate` as this module loads, for what waits after test code ran.
 */
let runNextTurn = setImmediate

/**
 * `v8.setFlagsFromString` as this module loads.
 */
let setV8Flags = setFlagsFromString

/**
 * Boots a worker and starts its message loop. The read tracker comes first,
 * because `graceful-fs` clones `fs` once: one that is in `require.cache` before
 * any Jest package loads came with a `--require` and reads past the tracker,
 * which the units then say. Resolvers are made here and never lazily: on Jest
 * 29.7 making one loads `graceful-fs`, which patches `fs.close`, and a lazy one
 * would dirty the first unit. The guard comes last, as its baseline must hold
 * the IPC pipe the `message` listener refs, and the mask global setup left,
 * which a fork from main does not inherit. A unit that throws leaves the exit
 * without `done` for main to read. The heap flag leaves `execArgv` and V8's
 * flags right after the tracker: a limit is read when an isolate is made, so
 * this worker keeps its cap, while what a test forks or starts as a thread gets
 * what it gets in plain Jest. Types are stripped only where the project's Jest
 * strips them, which needs Node's function. One count of the calls into the
 * resolvers and transformers of the projects serves every unit, which tells
 * what they read apart from what tests read. The temporary directory, as Node
 * gives it and as its real path, is where tests put what they make, under a new
 * name each run.
 *
 * @param input - What the worker runs with.
 * @param input.process - The worker's process, with `MOOTANT_SESSION`, the
 *   absolute path of `session.json`, `MOOTANT_SLOT` and, when it has a heap
 *   limit from mootant, `MOOTANT_HEAP_FLAG` in its environment.
 * @param input.global - The worker's global object, with its `performance`.
 * @param input.stores - `AsyncLocalStorage.prototype`.
 * @param input.stripTypes - `module.stripTypeScriptTypes`, which Node before
 *   22.13 lacks.
 */
export function bootWorker(input: {
  stripTypes: ((code: string, options: { mode: 'strip' }) => string) | undefined
  global: { performance: Pick<Performance, 'clearMeasures' | 'clearMarks'> }
  process: WorkerProcess
  stores: object
}): void {
  trackFileReads(null)
  let { process: target, global, stores } = input
  let heapFlag = target.env['MOOTANT_HEAP_FLAG']
  if (heapFlag !== undefined) {
    target.execArgv = target.execArgv.filter(flag => flag !== heapFlag)
    setV8Flags('--max-old-space-size=0')
  }
  let sessionFile = target.env['MOOTANT_SESSION']!
  let slot = target.env['MOOTANT_SLOT']!
  delete target.env['MOOTANT_HEAP_FLAG']
  delete target.env['MOOTANT_SESSION']
  delete target.env['MOOTANT_SLOT']
  let channel = createWorkerChannel()
  Reflect.set(target, CHANNEL_SLOT, channel)
  let session = JSON.parse(readFileSync(sessionFile, 'utf8')) as WorkerSession
  target.umask(session.umask)
  let load = createRequire(sessionFile)
  let tracked = Object.keys(load.cache).every(
    file => !file.includes('/graceful-fs/'),
  )
  let { default: TestRunner } = load(session.packages.runner) as {
    default: UnitWorker['TestRunner']
  }
  let { default: Runtime } = load(session.packages.runtime) as {
    default: { createResolver(config: object, moduleMap: unknown): object }
  }
  let { default: HasteMap } = load(session.packages.hasteMap) as {
    default: {
      getStatic(config: object): {
        getModuleMapFromJSON(json: JestModuleMap): unknown
      }
    }
  }
  let { requireOrImportModule } = load(session.packages.util) as {
    requireOrImportModule(file: string): Promise<unknown>
  }
  let { default: Resolver } = load(session.packages.resolve) as {
    default: UnitWorker['Resolver']
  }
  let { getConsoleOutput, BufferedConsole } = load(
    session.packages.console,
  ) as Pick<UnitWorker, 'getConsoleOutput' | 'BufferedConsole'>
  let calls: WorkerCalls = {
    asyncTransformer: new AsyncLocalStorage(),
    asyncResolver: new AsyncLocalStorage(),
    environment: new AsyncLocalStorage(),
    defaultResolver: 0,
    transformer: 0,
    unsettled: 0,
    resolver: 0,
  }
  let defaultResolver = path.join(
    session.packages.resolve,
    'build/defaultResolver.js',
  )
  if (existsSync(defaultResolver)) {
    countDefaultResolverCalls(
      load(defaultResolver) as Parameters<typeof countDefaultResolverCalls>[0],
      calls,
    )
  }
  channel.enterEnvironment = () => {
    calls.environment.enterWith(true)
  }
  let early = trackSpawners(target.env, name => {
    if (
      calls.transformer === 0 &&
      calls.asyncTransformer.getStore() !== true &&
      calls.environment.getStore() !== true
    ) {
      channel.vm?.addVariable(name)
    }
  })
  let projects = new Map<string, BootedProject>(
    session.projects.map(({ moduleMap: json, config, id }) => {
      let moduleMap = HasteMap.getStatic(config).getModuleMapFromJSON(json)
      return [
        id,
        {
          resolver: countResolverCalls(
            Runtime.createResolver(config, moduleMap),
            calls,
          ),
          configString: JSON.stringify(config),
          wrapped: new Map(),
          moduleMap,
          config,
        },
      ]
    }),
  )
  let flags = { stale: false }
  let dead = new WeakSet<object>()
  Reflect.set(global, WORKER_SLOT, {
    transformer: createTransformerFactory({
      stripTypes:
        session.packages.stripsTypes ? (input.stripTypes ?? null) : null,
      requireOrImportModule,
      projects,
      channel,
      calls,
    }),
    testRunner: createTestRunner({
      onStale() {
        flags.stale = true
      },
      requireOrImportModule,
      projects,
      channel,
      calls,
      dead,
    }),
  })
  let outside = new Set<string>()
  Reflect.set(global, RUNTIME_GLOBAL, {
    hit(id: string) {
      outside.add(id)
      return false
    },
  })
  let disableStores = trackStores(stores)
  let clearMarks = global.performance.clearMarks.bind(global.performance)
  let clearMeasures = global.performance.clearMeasures.bind(global.performance)
  let checkState: UnitWorker['checkState']
  let temporary = tmpdir()
  let worker: UnitWorker = {
    reads: {
      temporary:
        existsSync(temporary) ?
          [temporary, realpathSync(temporary)]
        : [temporary],
      extensions: new Set(session.reads.extensions),
      directories: session.reads.directories,
    },
    clearPerformance() {
      clearMarks()
      clearMeasures()
    },
    directory: path.dirname(sessionFile),
    globalConfig: session.globalConfig,
    checkState: () => checkState(),
    requireCache: load.cache,
    getConsoleOutput,
    BufferedConsole,
    process: target,
    disableStores,
    TestRunner,
    Resolver,
    projects,
    outside,
    tracked,
    channel,
    early,
    calls,
    flags,
    dead,
    slot,
  }

  let modules = [
    ...target.execArgv,
    ...(target.env['NODE_OPTIONS'] ?? '').split(/\s+/u),
  ].includes('--experimental-vm-modules')
  let units = 0

  /**
   * Runs a unit, says when it ended, and ends the worker when it must not run
   * another one, only after the message is out: a message followed by an exit
   * can be lost. With `--experimental-vm-modules` a worker ends after a number
   * of units, as it keeps the vm context of every unit.
   *
   * @param unit - Unit main sent.
   */
  async function run(unit: JestUnit): Promise<void> {
    let last: boolean
    try {
      last = await runUnit(unit, worker)
    } catch (error) {
      let text = (error as Error | null)?.stack ?? getErrorMessage(error)
      target.stderr.write(`mootant: ${text}\n`)
      target.exit(1)
      return
    }
    units += 1
    last ||= modules && units >= VM_MODULE_UNITS
    target.send!({ type: 'done', last }, () => {
      if (last) {
        target.exit(0)
      }
    })
  }

  installExitGuards(target)
  target.on('message', message => {
    void run((message as { unit: JestUnit }).unit)
  })
  target.on('disconnect', () => {
    target.exit(0)
  })
  checkState = createStateGuard({ setImmediate: runNextTurn, process: target })
  target.send!({ type: 'ready' })
}
