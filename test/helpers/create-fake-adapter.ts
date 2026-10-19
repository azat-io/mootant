import type {
  IsolatedResult,
  IsolatedFacts,
} from '../../types/adapter/isolated-result'
import type { AdapterSession } from '../../types/adapter/adapter-session'
import type { AdapterContext } from '../../types/adapter/adapter-context'
import type { DryRunRequest } from '../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../types/adapter/dry-run-result'
import type { IsolatedPlan } from '../../types/adapter/isolated-plan'
import type { CacheInputs } from '../../types/adapter/cache-inputs'
import type { BatchResult } from '../../types/adapter/batch-result'
import type { TestAdapter } from '../../types/adapter/test-adapter'
import type { RunInputs } from '../../types/adapter/run-inputs'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { BatchPlan } from '../../types/adapter/batch-plan'
import type { TryFacts } from '../../types/adapter/try-facts'
import type { DryFile } from '../../types/adapter/dry-file'

/**
 * Simulated project behind a fake adapter.
 */
export interface FakeWorld {
  /**
   * Changes what an isolated run reports.
   */
  onIsolated?(
    result: IsolatedResult,
    plan: IsolatedPlan,
    call: number,
  ): IsolatedResult

  /**
   * Changes what a batch run reports, such as dropping tries.
   */
  onBatch?(result: BatchResult, plan: BatchPlan, call: number): BatchResult

  /**
   * Changes what a dry run reports.
   */
  onDry?(result: DryRunResult, request: DryRunRequest): DryRunResult

  /**
   * Texts the tests print in every dry run, each with the absolute path of its
   * test file or null; nothing when omitted.
   */
  output?: { file: string | null; text: string }[]

  /**
   * Warnings the session reports at start.
   */
  diagnostics?: Diagnostic[]

  /**
   * What every verdict depends on; when given, the session supports the cache
   * and every dry test file reports its dependencies.
   */
  cacheInputs?: CacheInputs

  /**
   * Test files with load-time behavior.
   */
  files?: FakeTestFile[]

  /**
   * Switched files the runner loads with another text.
   */
  mismatched?: string[]

  /**
   * Test and setup files; the files of the tests when omitted.
   */
  testFiles?: string[]

  /**
   * Switched files the runner never serves.
   */
  unserved?: string[]

  /**
   * Ids of the mutants the runner evaluates outside its workers.
   */
  outside?: string[]

  /**
   * Tests in file order.
   */
  tests: FakeTest[]

  /**
   * Test files the session runs at once; not reported when omitted.
   */
  workers?: number

  /**
   * Version of the test runner the session reports; none when omitted.
   */
  version?: string

  /**
   * Whether the adapter has batch mode; true when omitted.
   */
  batch?: boolean
}

/**
 * Fake adapter with what the core asked of it.
 */
export interface FakeAdapter {
  /**
   * Requests and plans the core sent, by method.
   */
  calls: {
    isolated: IsolatedPlan[]
    dry: DryRunRequest[]
    batch: BatchPlan[]
  }

  /**
   * Context of the last session start, or null.
   */
  context: AdapterContext | null

  /**
   * The adapter to give the core.
   */
  adapter: TestAdapter

  /**
   * Calls of `close`.
   */
  closed: number
}

/**
 * Test of the simulated project and how mutants change it.
 */
interface FakeTest {
  /**
   * How it behaves without mutants: `flaky` fails its second dry try, `broken`
   * fails while a switched file it reaches is served, `repeated` fails both
   * tries when the tests of its file run twice and passes when they run once,
   * `failing` always fails.
   */
  dry?: 'repeated' | 'failing' | 'broken' | 'flaky'

  /**
   * Failure messages of the mutants that make it fail only in a fresh module
   * graph: in a batch, state a control try left hides them.
   */
  freshKills?: Record<string, string>

  /**
   * Failure messages of the mutants that make it fail when it reaches them.
   */
  kills?: Record<string, string>

  /**
   * Mutants it reaches only in its first dry try.
   */
  firstOnly?: string[]

  /**
   * Mutants that cause a stray error when it reaches them.
   */
  strays?: string[]

  /**
   * Mutants it reaches whenever it runs.
   */
  covers?: string[]

  /**
   * Milliseconds of a try; 1 when omitted.
   */
  duration?: number

  /**
   * Mutants that make it run out of time when it reaches them.
   */
  hangs?: string[]

  /**
   * Mutants that make it loop through sites past any hit limit.
   */
  loops?: string[]

  /**
   * Absolute path of its test file.
   */
  file: string

  /**
   * Id of the test; also its name.
   */
  id: string
}

/**
 * Test file of the simulated project.
 */
interface FakeTestFile {
  /**
   * Files it depends on, when the session supports the cache; the test file
   * itself when omitted, null when the runner cannot tell.
   */
  dependencies?: string[] | null

  /**
   * Environment variables it reads, when the session supports the cache; none
   * when omitted.
   */
  environment?: string[]

  /**
   * Mutants it reaches while loading.
   */
  loadCovers?: string[]

  /**
   * Milliseconds of loading; 0 when omitted.
   */
  loadDuration?: number

  /**
   * Mutants that make it fail to load.
   */
  loadKills?: string[]

  /**
   * Mutants that make a suite hook of it fail when a unit runs them.
   */
  hookKills?: string[]

  /**
   * Whether it has tests marked concurrent.
   */
  concurrent?: boolean

  /**
   * Dependencies it changes itself, when the session supports the cache; none
   * when omitted.
   */
  modified?: string[]

  /**
   * Whether it fails to load while a switched file it reaches is served.
   */
  broken?: boolean

  /**
   * Absolute path.
   */
  file: string
}

/**
 * Pattern of a site check in a switched text.
 */
const SITE_PATTERN = /hit\("(?<id>[^"]+)"\)/gu

/**
 * Creates an in-memory adapter that simulates a test runner: tests reach the
 * mutants listed for them, but only while a switched file hosts the mutant, and
 * fail, hang, loop or throw stray errors as the world says. Batch units run a
 * control before the first mutant try and after each one, and stop trying a
 * mutant after it failed; isolated units run their whole test file.
 *
 * @param world - Tests, test files and anomalies of the simulated project.
 * @returns The adapter and the record of its calls.
 */
export function createFakeAdapter(world: FakeWorld): FakeAdapter {
  let fake: FakeAdapter = {
    adapter: {
      start: context => {
        fake.context = context
        return Promise.resolve(session)
      },
      batch: world.batch ?? true,
      name: 'fake',
    },
    calls: { isolated: [], batch: [], dry: [] },
    context: null,
    closed: 0,
  }
  let session: AdapterSession = {
    ...(world.cacheInputs && {
      cacheInputs: () => Promise.resolve(world.cacheInputs!),
    }),
    ...(world.diagnostics && { diagnostics: world.diagnostics }),
    ...(world.workers && { workers: world.workers }),
    ...(world.version && { version: world.version }),
    dryRun: request => {
      fake.calls.dry.push(request)
      if (world.output !== undefined) {
        for (let { file, text } of world.output) {
          fake.context!.onOutput?.(text, file)
        }
      }
      let active = getActive()
      let tests =
        request.files === null ?
          world.tests
        : world.tests.filter(test =>
            request.files!.some(({ file }) => file === test.file),
          )
      let files = [...new Set(tests.map(test => test.file))].map(
        (file): DryFile => {
          let spec = world.files?.find(entry => entry.file === file)
          let covers =
            request.instrumented ?
              (spec?.loadCovers ?? []).filter(id => active.has(id))
            : []
          return {
            ...(world.cacheInputs && {
              dependencies:
                spec?.dependencies === undefined ? [file] : spec.dependencies,
              environment: spec?.environment ?? [],
              ...(spec?.modified && { modified: spec.modified }),
            }),
            errors:
              spec?.broken === true && covers.length > 0 ? ['broken'] : [],
            loadFailed: spec?.broken === true && covers.length > 0,
            loadDuration: spec?.loadDuration ?? 0,
            concurrent: spec?.concurrent === true,
            hits: covers.length,
            hookDuration: 0,
            project: '',
            covers,
            file,
          }
        },
      )
      let result: DryRunResult = {
        tests: tests.map(test => {
          let both = reach(test.covers, active, request.instrumented)
          let first = [
            ...reach(test.firstOnly, active, request.instrumented),
            ...both,
          ].toSorted()
          let broken = test.dry === 'broken' && first.length > 0
          let failedFirst =
            test.dry === 'failing' ||
            broken ||
            (test.dry === 'repeated' && request.repeat)
          let failedSecond = failedFirst || test.dry === 'flaky'
          return {
            tries:
              request.repeat ?
                [
                  createDryTry(test, first, failedFirst),
                  createDryTry(test, both, failedSecond),
                ]
              : [createDryTry(test, first, failedFirst)],
            file: test.file,
            name: test.id,
            project: '',
            id: test.id,
            line: null,
          }
        }),
        mismatched: fake
          .context!.files.map(entry => entry.file)
          .filter(file => world.mismatched?.includes(file)),
        served: fake
          .context!.files.map(entry => entry.file)
          .filter(file => !world.unserved?.includes(file)),
        outside: world.outside ?? [],
        hung: [],
        files,
      }
      for (let _file of files) {
        fake.context!.onUnitEnd?.()
      }
      return Promise.resolve(world.onDry?.(result, request) ?? result)
    },
    runBatch: plan => {
      fake.calls.batch.push(plan)
      let result: BatchResult = {
        ...(world.cacheInputs && { inputs: [] }),
        hookErrors: [],
        incomplete: [],
        tries: [],
        late: [],
      }
      for (let [index, unit] of plan.units.entries()) {
        let spec = world.files?.find(entry => entry.file === unit.file)
        let inputs = readInputs(unit.file)
        if (inputs) {
          result.inputs?.push({ ...inputs, unit: index })
        }
        if (
          unit.tests.some(test =>
            test.mutants.some(mutant => has(spec?.hookKills, mutant)),
          )
        ) {
          result.hookErrors.push({ message: 'hook boom', unit: index })
        }
        let killed = new Set<string>()
        let tests = getFileTests(unit.file)
        let last = tests.findLastIndex(test =>
          unit.tests.some(planned => planned.id === test.id),
        )
        let running = tests.slice(0, last + 1)
        for (let test of running) {
          let planned = unit.tests.find(entry => entry.id === test.id)
          let mutants =
            planned === undefined ?
              [null]
            : [
                null,
                ...planned.mutants.flatMap(mutant =>
                  killed.has(mutant) ? [] : [mutant, null],
                ),
              ]
          for (let mutant of mutants) {
            let facts = simulate(test, mutant, false)
            if (mutant !== null && (facts.failed || facts.timedOut)) {
              killed.add(mutant)
            }
            result.tries.push({ ...facts, unit: index })
          }
        }
      }
      return Promise.resolve(
        world.onBatch?.(result, plan, fake.calls.batch.length) ?? result,
      )
    },
    runIsolated: plan => {
      fake.calls.isolated.push(plan)
      let result = { units: plan.units.map(runIsolatedUnit) }
      let reported =
        world.onIsolated?.(result, plan, fake.calls.isolated.length) ?? result
      for (let unit of plan.units.keys()) {
        let facts = reported.units.find(entry => entry.unit === unit)
        fake.context!.onUnitEnd?.(
          facts === undefined ? { unit } : { facts, unit },
        )
      }
      return Promise.resolve(reported)
    },
    listTestFiles: () =>
      Promise.resolve(
        world.testFiles ?? [...new Set(world.tests.map(test => test.file))],
      ),
    close: () => {
      fake.closed += 1
      return Promise.resolve()
    },
  }

  /**
   * Collects the ids of the mutants the switched files host.
   *
   * @returns Ids of the hosted mutants.
   */
  function getActive(): Set<string> {
    let active = new Set<string>()
    for (let entry of fake.context!.files) {
      for (let match of entry.switched.matchAll(SITE_PATTERN)) {
        active.add(match.groups!['id']!)
      }
    }
    return active
  }

  /**
   * Lists the tests of a test file in file order.
   *
   * @param file - Absolute path of the test file.
   * @returns Tests in the order they run.
   */
  function getFileTests(file: string): FakeTest[] {
    return world.tests.filter(test => test.file === file)
  }

  /**
   * Reports what a unit of a test file read: its dependencies and environment
   * variables, as in the dry run.
   *
   * @param file - Absolute path of the test file.
   * @returns Inputs of the unit, or null when the runner cannot tell.
   */
  function readInputs(file: string): RunInputs | null {
    let spec = world.files?.find(entry => entry.file === file)
    let dependencies =
      spec?.dependencies === undefined ? [file] : spec.dependencies
    return dependencies === null ? null : (
        { environment: spec?.environment ?? [], dependencies }
      )
  }

  /**
   * Runs one isolated unit.
   *
   * @param unit - Unit of the plan.
   * @param index - Position of the unit in the plan.
   * @returns What the unit observed.
   */
  function runIsolatedUnit(
    unit: IsolatedPlan['units'][number],
    index: number,
  ): IsolatedFacts {
    let spec = world.files?.find(entry => entry.file === unit.file)
    let loadError =
      spec?.loadKills?.includes(unit.mutant) === true ? 'load boom' : null
    let tries =
      loadError === null ?
        getFileTests(unit.file).map(test => simulate(test, unit.mutant, true))
      : []
    return {
      ...(world.cacheInputs && { inputs: readInputs(unit.file) }),
      hookError:
        loadError === null && has(spec?.hookKills, unit.mutant) ?
          'hook boom'
        : null,
      reached:
        spec?.loadCovers?.includes(unit.mutant) === true ||
        tries.some(facts => facts.reached),
      duration:
        (spec?.loadDuration ?? 0) +
        tries.reduce((sum, facts) => sum + facts.duration, 0),
      hits: tries.reduce((sum, facts) => sum + facts.hits, 0),
      incomplete: null,
      timedOut: false,
      tests: tries,
      unit: index,
      strays: [],
      loadError,
    }
  }

  return fake
}

/**
 * Simulates one try of a test with a mutant active.
 *
 * @param test - Test of the world.
 * @param mutant - Active mutant, or null for a control try.
 * @param fresh - Whether the try runs in a fresh module graph.
 * @returns Facts of the try.
 */
function simulate(
  test: FakeTest,
  mutant: string | null,
  fresh: boolean,
): TryFacts {
  let reached = mutant !== null && (test.covers ?? []).includes(mutant)
  let message =
    reached ?
      (test.kills?.[mutant!] ??
      (fresh ? test.freshKills?.[mutant!] : undefined) ??
      null)
    : null
  return {
    hits: reached && has(test.loops, mutant) ? Number.MAX_SAFE_INTEGER : 1,
    strays: reached && has(test.strays, mutant) ? ['stray boom'] : [],
    timedOut: reached && has(test.hangs, mutant),
    duration: test.duration ?? 1,
    failed: message !== null,
    skipped: false,
    test: test.id,
    covers: null,
    reached,
    message,
    mutant,
  }
}

/**
 * Builds a dry try.
 *
 * @param test - Test of the world.
 * @param covers - Mutants the try reached.
 * @param failed - Whether the try failed.
 * @returns Facts of the try.
 */
function createDryTry(
  test: FakeTest,
  covers: string[],
  failed: boolean,
): TryFacts {
  return {
    message: failed ? 'expected true to be false' : null,
    duration: test.duration ?? 1,
    hits: covers.length,
    timedOut: false,
    reached: false,
    skipped: false,
    test: test.id,
    mutant: null,
    strays: [],
    covers,
    failed,
  }
}

/**
 * Keeps the mutants a dry try reaches: those hosted by a switched file, and
 * none without instrumentation.
 *
 * @param ids - Mutants the test lists, if any.
 * @param active - Mutants hosted by the switched files.
 * @param instrumented - Whether the switched files are served.
 * @returns Mutants the try reaches.
 */
function reach(
  ids: undefined | string[],
  active: Set<string>,
  instrumented: boolean,
): string[] {
  return instrumented ? (ids ?? []).filter(id => active.has(id)) : []
}

/**
 * Tells whether a mutant is among the ids a test lists for an anomaly.
 *
 * @param ids - Mutants listed for the anomaly, if any.
 * @param mutant - Active mutant.
 * @returns Whether the anomaly applies.
 */
function has(ids: undefined | string[], mutant: string | null): boolean {
  return mutant !== null && (ids ?? []).includes(mutant)
}
