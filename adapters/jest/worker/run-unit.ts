import path from 'node:path'

import type { JestFileFacts } from '../types/jest-file-facts'
import type { BootedProject } from '../types/booted-project'
import type { UnitWorker } from '../types/unit-worker'
import type { JestUnit } from '../types/jest-unit'
import type { VmSide } from '../types/vm-side'

import { compareCodeUnits } from '../../../core/compare-code-units'
import { trackFileInputs } from '../../shared/track-file-inputs'
import { getErrorMessage } from '../../shared/get-error-message'
import { installExitGuards } from './install-exit-guards'
import { wrapProjectConfig } from './wrap-project-config'
import { readErrorFacts } from './read-error-facts'
import { readJestResult } from './read-jest-result'

/**
 * `path.extname` as this module loads, since test code the filter of reads runs
 * beside may replace it.
 */
let getExtension = path.extname

/**
 * Runs one test file through Jest's own `TestRunner` in serial mode: a fresh vm
 * and module registry in this process. Jest picks the console of the tests from
 * the global copy, which the unit's console decides, as the project copy says
 * nothing of it. What the vm left is stopped through what its setup registered,
 * since the wrapper of the test framework never runs when a setup file throws.
 * The file cache of `jest-resolve` goes only after a failure, as a plain run
 * clears it at its end and a file a failing test left missing would stay
 * missing, while the speed of a warm worker rests on it. The exit guards come
 * back after the turns the check of shared state waits, so that a rejection
 * Jest left in the unit, as Jest 29.7 does for an ES module that fails to
 * parse, meets the listener its test framework left, as in plain Jest. The last
 * record of the unit, `finish`, holds what Jest reported, what the vm counted
 * and what the unit left in the worker, and in a dry run what a console that
 * kept it printed, as Jest's reporters show it; its variables hold `*` in a
 * worker that met a promisified `execFile` made before its wrappers
 * (`UnitWorker.early`), as a child that function starts gets them all. Nobody
 * reads what a unit with a mutant printed, so there a console that keeps what
 * tests print takes no stack for the origin of an entry, which costs about 50
 * µs a call; it still formats what it gets, and its buffer still holds the
 * messages, as tests may read them. What the console kept is emptied once
 * `finish` is written, since with `--experimental-vm-modules` the vm of every
 * unit, its console with it, stays in the worker. A read counts under the
 * directories of the session, or with one of its extensions outside the
 * temporary directory, where tests make files under new names each run, but
 * never under `node_modules`, which the lockfile stands for, in mootant's
 * files, or as a `node:` name that a stack frame gave and the tracker made a
 * path of. What Jest's resolver reads does not count, as it keeps what it found
 * across units and a real load is read anyway, but what a project's own
 * resolver reads, a file it only looks for too, decides what it gives, Jest's
 * default one aside when it hands that a request
 * (`WorkerCalls.defaultResolver`); that and what a transformer reads go apart,
 * as the session's, since a warm worker reads them only once, and stay among
 * the reads too when code outside the transformers read them, as a test file
 * loads a source the language service of ts-jest read first. The CommonJS
 * modules the own realm of the worker loaded so far count as reads do, since a
 * warm worker does not read a transformer, a test environment or a resolver
 * again, nor what they import; ES modules are not in `require.cache`, so one of
 * those counts only in the unit that loaded it. A transform still running when
 * the run ended, of an import the unit never awaited, ends the worker: what it
 * reads from then on reaches no unit, and a later unit would get the module
 * from the worker's memory.
 *
 * @param unit - Test file, project, mutant, switch plan and out file.
 * @param worker - What the boot of the worker made.
 * @returns Whether the worker must not run another unit, since an error of an
 *   earlier unit showed up, the unit left shared state changed or a transform
 *   unsettled.
 */
export async function runUnit(
  unit: JestUnit,
  worker: UnitWorker,
): Promise<boolean> {
  let { BufferedConsole, process: target, directory, channel, flags } = worker
  let { directories, extensions, temporary } = worker.reads
  let { calls } = worker
  let token = channel.begin(unit)

  /**
   * Tells whether a path lies under one of some directories.
   *
   * @param parents - Absolute directories.
   * @param file - Absolute path.
   * @returns Whether it does.
   */
  function isUnder(parents: readonly string[], file: string): boolean {
    return parents.some(parent => file.startsWith(`${parent}/`))
  }

  /**
   * Tells whether a file the unit read or the worker loaded counts.
   *
   * @param file - Absolute path.
   * @returns Whether it does.
   */
  function counts(file: string): boolean {
    return (
      !file.includes('/node_modules/') &&
      !file.endsWith('/node_modules') &&
      !file.startsWith(`${directory}/`) &&
      !file.includes('/node:') &&
      (isUnder(directories, file) ||
        (!isUnder(temporary, file) &&
          extensions.has(getExtension(file).slice(1))))
    )
  }

  let project = worker.projects.get(unit.project)!
  let ownResolver = typeof project.config.resolver === 'string'
  let transformed = new Set<string>()
  let direct = new Set<string>()

  /**
   * Tells whether a read counts, and remembers whether a warm worker may not
   * make it again, which sorts it once the unit ended: what a transformer
   * reads, what is read before the vm is set up but the test file, as the test
   * environment and the test runner load then, once in a worker, what the
   * environment reads in its own calls and the real test runner as it loads,
   * which may keep it across units (`WorkerCalls.environment`), and what the
   * project's own resolver reads, a file it looks for too, such as a map of the
   * paths it gives or a flag it chooses by, as Jest keeps what it resolved
   * across units. Such a file goes apart unless code in the vm read it too.
   *
   * @param file - Absolute path.
   * @returns Whether it counts, which no read of Jest's own resolver does: its
   *   probes are kept across units, and a real load is read anyway.
   */
  function accept(file: string): boolean {
    let resolving =
      calls.resolver > 0 || calls.asyncResolver.getStore() === true
    if (
      !counts(file) ||
      (resolving && (!ownResolver || calls.defaultResolver > 0))
    ) {
      return false
    }
    if (
      resolving ||
      calls.transformer > 0 ||
      calls.asyncTransformer.getStore() === true ||
      calls.environment.getStore() === true ||
      (channel.vm === null && file !== unit.file)
    ) {
      transformed.add(file)
    } else {
      direct.add(file)
    }
    return true
  }

  let tracking = trackFileInputs(accept)
  flags.stale = false
  let globalConfig = {
    ...worker.globalConfig,
    verbose: unit.console === 'stream',
    silent: unit.console === 'none',
    updateSnapshot: 'none',
    collectCoverage: false,
  }
  let runner = new worker.TestRunner(globalConfig, {})
  let { write } = BufferedConsole
  if (unit.mutant !== null && unit.console === 'buffer') {
    BufferedConsole.write = keepWithoutOrigin
  }
  let printed: undefined | object[]
  let facts = new Promise<JestFileFacts>(resolve => {
    runner.on('test-file-success', ([, result]) => {
      printed = result.console
      resolve(readJestResult(result))
    })
    runner.on('test-file-failure', ([, error]) => {
      resolve(readFailure(error, worker))
    })
  })
  let running = runner.runTests(
    [
      {
        context: {
          config: readWrappedConfig(project, unit.plan, directory),
          moduleMap: project.moduleMap,
          resolver: project.resolver,
        },
        duration: undefined,
        path: unit.file,
      },
    ],
    { isInterrupted: () => false },
    { serial: true },
  )
  // `TestRunner` forces 1 at the start of its async function, and the
  // environment copies `process.env` later, so a test sees the slot.
  target.env['JEST_WORKER_ID'] = worker.slot
  await running
  BufferedConsole.write = write
  if (worker.early) {
    channel.vm?.addVariable('*')
  }
  let side = closeVmSide(channel.vm, worker.dead)
  worker.clearPerformance()
  let { modified, files } = tracking.stop()
  let unsettled = calls.unsettled > 0
  worker.disableStores()
  let dirty = await readDirtyState(worker)
  installExitGuards(target)
  let file = await facts
  if (file.outcome !== 'result' || file.failureMessage !== null) {
    worker.Resolver.clearDefaultResolverCache()
  }
  channel.write(token, {
    ...file,
    consoleOutput:
      printed === undefined || unit.mutant !== null ?
        null
      : `  ● Console\n\n${worker.getConsoleOutput(printed, project.config, globalConfig)}\n`,
    loaded: Object.keys(worker.requireCache)
      .filter(counts)
      .toSorted(compareCodeUnits),
    transforms: files.filter(read => transformed.has(read)),
    reads: files.filter(read => direct.has(read)),
    outside: [...worker.outside],
    tracked: worker.tracked,
    writes: modified,
    kind: 'finish',
    dirty,
    ...side,
  })
  channel.end()
  if (printed !== undefined) {
    printed.length = 0
  }
  return dirty.length > 0 || flags.stale || unsettled
}

/**
 * Stops what the vm of a unit left and reads what it counted.
 *
 * @param side - What the vm's setup registered, or null when it never ran.
 * @param dead - Receives the `Error` of the vm, so an error of this unit reads
 *   as stale in a later one.
 * @returns What the `finish` record takes from the vm.
 */
function closeVmSide(
  side: VmSide | null,
  dead: WeakSet<object>,
): { variables: string[]; covers: string[]; hits: number } {
  if (side === null) {
    return { variables: [], covers: [], hits: 0 }
  }
  side.stopTimers()
  dead.add(side.realmError)
  side.close()
  // A dry side holds a `Set`, whose type on the runtime says only `add`.
  let coverage = side.runtime.coverage as Set<string> | null
  return {
    covers: [...(coverage ?? [])].toSorted(compareCodeUnits),
    variables: side.listVariables(),
    hits: side.runtime.hits,
  }
}

/**
 * Reads what the `finish` record of a unit takes from a test file that could
 * not run. Nothing here throws, since a project can throw anything.
 *
 * @param error - What Jest got.
 * @param worker - What the boot of the worker made.
 * @returns The facts of the file, whose failure message is the stack when there
 *   is one.
 */
function readFailure(error: unknown, worker: UnitWorker): JestFileFacts {
  let { message, realm } = readErrorFacts(error, {
    current: worker.channel.vm?.realmError ?? null,
    dead: worker.dead,
  })
  let failureMessage = message
  try {
    let stack: unknown = Reflect.get(error as object, 'stack')
    if (typeof stack === 'string') {
      failureMessage = stack
    }
  } catch {}
  return {
    outcome: 'failure',
    execError: null,
    failureMessage,
    snapshots: 0,
    lines: {},
    message,
    realm,
  }
}

/**
 * Gives the copy of a project's configuration for a switch plan, made once: a
 * stringify of a big configuration costs, and the plan path decides identity,
 * since Jest keeps its in-memory transforms by the copy.
 *
 * @param project - Project of the unit.
 * @param plan - Absolute path of the switch plan, or null.
 * @param directory - Real path of the directory of mootant's Jest files.
 * @returns The copy.
 */
function readWrappedConfig(
  project: BootedProject,
  plan: string | null,
  directory: string,
): object {
  let wrapped = project.wrapped.get(plan)
  if (wrapped === undefined) {
    wrapped = wrapProjectConfig(project.config, plan, directory)
    project.wrapped.set(plan, wrapped)
  }
  return wrapped
}

/**
 * Compares what units share with the baseline. The comparison rejects when a
 * test removed its working directory, which leaves the worker dirty and not
 * dead.
 *
 * @param worker - What the boot of the worker made.
 * @returns The reasons the worker is no longer clean.
 */
async function readDirtyState(worker: UnitWorker): Promise<string[]> {
  try {
    return await worker.checkState()
  } catch (error) {
    return [`guard: ${getErrorMessage(error)}`]
  }
}

/**
 * Keeps an entry of what a test printed, as `BufferedConsole.write` does, but
 * with an empty origin, which spares the stack it would take.
 *
 * @param buffer - Entries the console kept.
 * @param type - Method of the console, such as `log`.
 * @param message - What it printed, formatted.
 * @returns The buffer.
 */
function keepWithoutOrigin(
  buffer: object[],
  type: string,
  message: string,
): object[] {
  buffer.push({ origin: '', message, type })
  return buffer
}
