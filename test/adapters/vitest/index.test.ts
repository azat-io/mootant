import {
  appendFile,
  writeFile,
  realpath,
  readFile,
  readdir,
  symlink,
  mkdtemp,
  mkdir,
  cp,
  rm,
} from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { AdapterSession } from '../../../types/adapter/adapter-session'
import type { MutantResult } from '../../../types/run/mutant-result'
import type { Diagnostic } from '../../../types/mutant/diagnostic'
import type { RunResult } from '../../../types/run/run-result'

import { startVitestSession } from '../../../adapters/vitest/start-vitest-session'
import { createWorkDirectory } from '../../../core/run/create-work-directory'
import { runReferenceMutants } from '../../helpers/run-reference-mutants'
import { compareCodeUnits } from '../../../core/compare-code-units'
import { getCachePath } from '../../../core/cache/get-cache-path'
import { classifyVerdict } from '../../helpers/classify-verdict'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { shortenDryRuns } from '../../helpers/shorten-dry-runs'
import { vitestAdapter } from '../../../adapters/vitest/index'
import { describeMutant } from '../../helpers/describe-mutant'
import { listMutants } from '../../../core/list-mutants'
import { runMutants } from '../../../core/run-mutants'
import { version } from '../../../package.json'

vi.mock(
  import('../../../adapters/vitest/start-vitest-session'),
  async importOriginal => {
    let actual = await importOriginal()
    return { startVitestSession: vi.fn(actual.startVitestSession) }
  },
)

/**
 * Root of the fixture project, with its own Vitest configuration.
 */
let runnerRoot = path.resolve(import.meta.dirname, '../../fixtures/runner')

/**
 * Summarizes a verdict for comparison.
 *
 * @param result - Verdict of a mutant.
 * @returns File, mutator, replacement and how the mutant ended.
 */
function summarizeVerdict(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.mutator,
    result.mutant.replacement.replaceAll(/\s+/gu, ' '),
    result.status,
    result.path ?? '-',
    result.isolatedBecause ?? '-',
    result.cause ?? '-',
  ].join(' | ')
}

/**
 * Root of the fixture project: one source file and one test file per risk of
 * the batch path; projects in subdirectories hold risks that need a project of
 * their own.
 */
let equivalenceRoot = path.resolve(
  import.meta.dirname,
  '../../fixtures/equivalence',
)

/**
 * Source files of the fixture project.
 */
let sources = [
  'src/around.ts',
  'src/clamp.ts',
  'src/collect.ts',
  'src/counter.ts',
  'src/lazy.ts',
  'src/ready.ts',
  'src/slug.ts',
  'src/threshold.ts',
  'src/tick.ts',
]

/**
 * Verdict of one mutant in each mode, reduced by `classifyVerdict`.
 */
interface Row {
  /**
   * Verdict of the mutant applied by hand.
   */
  reference: string

  /**
   * Verdict of the default run, where every mutant runs isolated.
   */
  isolated: string

  /**
   * File, mutator and replacement of the mutant.
   */
  mutant: string

  /**
   * Verdict of the `--fast` run.
   */
  fast: string
}

/**
 * Runs the mutants of a fixture project in the default mode, in fast mode, and
 * by hand.
 *
 * @param directory - Root of the fixture project.
 * @param files - Source files the untouched copy relates its tests to.
 * @param options - How the reference runs.
 * @param options.separate - Whether the reference runs every copy in its own
 *   Vitest run and counts every error of that run, teardown included.
 * @param options.config - Text of the Vitest configuration of the shared
 *   reference run, for a project that needs a plugin.
 * @param options.hangs - Tells the mutants a plain run never finishes with,
 *   such as a synchronous endless loop; the reference leaves them out as
 *   `hangs`.
 * @returns Both runs, whether the untouched copy passed, and a row per mutant.
 */
async function runAllPaths(
  directory: string,
  files: string[],
  options: {
    hangs?(result: MutantResult): boolean
    separate?: boolean
    config?: string
  } = {},
): Promise<{
  isolated: Awaited<ReturnType<typeof runMutants>>
  fast: Awaited<ReturnType<typeof runMutants>>
  original: boolean
  rows: Row[]
}> {
  let { hangs = () => false, separate = false, config } = options
  let builtIns = createBuiltIns('vitest', vitestAdapter())
  let isolated = await runMutants({
    cwd: directory,
    paths: ['src'],
    concurrency: 2,
    cache: false,
    builtIns,
  })
  let fast = await runMutants({
    cwd: directory,
    paths: ['src'],
    concurrency: 2,
    cache: false,
    fast: true,
    builtIns,
  })
  let reference = await runReferenceMutants(
    directory,
    isolated.results
      .filter(result => !hangs(result))
      .map(result => result.mutant),
    { sources: files, separate, config },
  )
  let fastById = new Map(fast.results.map(result => [result.mutant.id, result]))
  return {
    rows: isolated.results.map(result => ({
      reference: describeReference(
        hangs(result) ? null : reference.killed.get(result.mutant.id)!,
      ),
      fast: classifyVerdict(fastById.get(result.mutant.id)!),
      isolated: classifyVerdict(result),
      mutant: describeMutant(result),
    })),
    original: reference.original,
    isolated,
    fast,
  }
}

/**
 * Expects the default run, the `--fast` run and the reference to agree on every
 * mutant. No fixture mutant runs into a timer or a loop, so no Timeout verdict
 * is excepted: every mutant is Killed or Survived in both modes, as by hand.
 *
 * @param rows - Verdicts per mutant.
 */
function expectAgreement(rows: Row[]): void {
  expect(rows).toStrictEqual(
    rows.map(row => ({
      ...row,
      isolated: row.reference,
      fast: row.reference,
    })),
  )
  expect(new Set(rows.map(row => row.reference))).toStrictEqual(
    new Set(['survived', 'killed']),
  )
}

/**
 * Lists the files with a mutant the reference kills.
 *
 * @param rows - Verdicts per mutant.
 * @returns Paths of the files.
 */
function getKilledFiles(rows: Row[]): Set<string> {
  return new Set(
    rows
      .filter(row => row.reference === 'killed')
      .map(row => row.mutant.split(' | ', 1)[0]!),
  )
}

/**
 * Names the verdict of the reference.
 *
 * @param killed - Whether the copy failed, or null when it was left out.
 * @returns `killed`, `survived` or `hangs`.
 */
function describeReference(killed: boolean | null): string {
  if (killed === null) {
    return 'hangs'
  }
  return killed ? 'killed' : 'survived'
}

/**
 * Names a diagnostic by its code and place.
 *
 * @param diagnostic - Diagnostic of a run.
 * @returns Code, file and line of the diagnostic.
 */
function describeDiagnostic(diagnostic: Diagnostic): string {
  return [diagnostic.code, diagnostic.file, diagnostic.line].join(' | ')
}

/**
 * Fixture project: `src/size.ts` is covered by both test files, `src/limit.ts`
 * only by `test/limit.test.ts`; `test/size.test.ts` has a snapshot file.
 */
let fixture = path.resolve(import.meta.dirname, '../../fixtures/cache')

/**
 * Fixture project whose test file covers `src/route.ts` and depends on files
 * Vitest's workers never evaluate: a global setup file and what it imports,
 * CommonJS files loaded with `require`, a `tsconfig.json` file extended by the
 * root one, and a module chain only a mutant loads.
 */
let inputsFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-inputs',
)

/**
 * Fixture project whose tests read inputs outside the module graph: an
 * environment variable (`test/greet.test.ts`), a JSON file read with
 * `readFileSync` (`test/price.test.ts`), and modules only a mutant loads, by a
 * computed `import()` and by `require` (`src/pick.ts`).
 */
let runtimeFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-runtime',
)

/**
 * Fixture project whose tests have side effects on what they read: one lists
 * the environment variables (`test/listing.test.ts`), one starts a child
 * process that gets them (`test/child.test.ts`), one writes back the file it
 * read and adds and removes a file of a directory it lists
 * (`test/golden.test.ts`), one copies a fixture directory with `cpSync` and
 * lists a directory it creates with `mkdirSync` when missing
 * (`test/copy.test.ts`), and one reads values Vite's `define` and a global
 * setup file's `provide` take from environment variables
 * (`test/config.test.ts`).
 */
let effectsFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-effects',
)

/**
 * Fixture project whose units read inputs where no test runs or out of sight: a
 * worker-scoped fixture of `test/fixture.test.ts` reads a file and an
 * environment variable in its cleanup; `test/tree.test.ts` lists a directory
 * tree recursively, with `fs.glob` too where Node has it, and the test links a
 * directory into the tree; the custom test environment of
 * `test/environment.test.ts` reads a file in its `setup`, before the runner
 * exists.
 */
let teardownFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-teardown',
)

/**
 * Fixture project whose test file kills the mutants of `src/half.ts` in its
 * first test, so a unit stops there, while its second test reads
 * `test/late.json`.
 */
let bailFixture = path.resolve(import.meta.dirname, '../../fixtures/cache-bail')

/**
 * Fixture project whose mutants of `src/scale.ts` are reached without a kill by
 * `test/scale.test.ts`, the test file named after the module, and killed by
 * `test/other.test.ts`, which runs after it and costs more.
 */
let rankFixture = path.resolve(import.meta.dirname, '../../fixtures/cache-rank')

/**
 * Environment variables the tests change, with their values before.
 */
let variables = Object.fromEntries(
  [
    'TERM_SESSION_ID',
    'MOOTANT_PROVIDE',
    'MOOTANT_FIXTURE',
    'MOOTANT_DEFINE',
    'MOOTANT_CHILD',
    'OLDPWD',
    'SHLVL',
  ].map(name => [name, process.env[name]]),
)

/**
 * Copies of the fixture to remove after each test.
 */
let copies: string[] = []

/**
 * Copies the fixture into a temporary directory with a `node_modules` of its
 * own, where a link to the repository's Vitest stands for the installed one, so
 * the cache file of every test is private.
 *
 * @param source - Fixture to copy.
 * @returns Real path of the copy.
 */
async function copyFixture(source = fixture): Promise<string> {
  let root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'mootant-cache-')),
  )
  copies.push(root)
  await cp(source, root, { recursive: true })
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(
    await realpath(
      path.resolve(import.meta.dirname, '../../../node_modules/vitest'),
    ),
    path.join(root, 'node_modules/vitest'),
  )
  // Files modified in the millisecond a run starts count as changed during it.
  await setTimeout(5)
  return root
}

/**
 * Runs the mutants of the copy with Vitest and counts the isolated units.
 *
 * @param root - Root of the copy.
 * @param options - Fast mode and the cache setting.
 * @param options.fast - Whether to run in fast mode.
 * @param options.cache - Whether to use the cache; on when omitted.
 * @returns Result of the run and the isolated units it ran.
 */
async function run(
  root: string,
  options: { cache?: boolean; fast?: boolean } = {},
): Promise<{ result: RunResult; units: number }> {
  let units = 0
  let result = await runMutants({
    onProgress: event => {
      if (event.kind === 'run-start' && event.run === 'isolated') {
        units += event.units
      }
    },
    builtIns: createBuiltIns('vitest', vitestAdapter()),
    paths: ['src'],
    concurrency: 2,
    cwd: root,
    ...options,
  })
  return { result, units }
}

/**
 * Makes `test/scale.test.ts` of a copy of the rank fixture loop until a value
 * grows, so mutants that stop `scale` from growing it hit the limit there.
 *
 * @param root - Root of the copy.
 */
async function writeLoopingScaleTest(root: string): Promise<void> {
  await writeFile(
    path.join(root, 'test/scale.test.ts'),
    [
      "import { expect, it } from 'vitest'",
      '',
      "import { scale } from '../src/scale'",
      '',
      "it('scales up', () => {",
      '  let value = 1',
      '  while (value < 100) {',
      '    value = scale(value)',
      '  }',
      '  expect(value).toBe(128)',
      '})',
      '',
    ].join('\n'),
  )
}

/**
 * Lists the files of the mutants whose verdict came from the cache, and of
 * those whose did not, without mutants nothing ran.
 *
 * @param result - Result of a run.
 * @returns Display paths of the cached and the run mutants.
 */
function splitCached(result: RunResult): { cached: string[]; ran: string[] } {
  let covered = result.results.filter(entry => entry.status !== 'NoCoverage')
  return {
    cached: [
      ...new Set(
        covered.filter(entry => entry.cached).map(entry => entry.mutant.file),
      ),
    ],
    ran: [
      ...new Set(
        covered.filter(entry => !entry.cached).map(entry => entry.mutant.file),
      ),
    ],
  }
}

/**
 * Summarizes a verdict for comparison.
 *
 * @param result - Verdict of a mutant.
 * @returns File, replacement, status, path and the test of the verdict.
 */
function summarizeCachedVerdict(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.replacement,
    result.status,
    result.path ?? '-',
    result.killedBy ?? '-',
  ].join(' | ')
}

describe('vitestAdapter', () => {
  afterEach(() => {
    vi.mocked(startVitestSession).mockReset()
  })

  it("creates a batch adapter with mootant's version that starts a Vitest session", async () => {
    let session = {} as AdapterSession
    vi.mocked(startVitestSession).mockResolvedValue(session)
    let context = {} as AdapterContext
    let adapter = vitestAdapter({ config: 'vitest.unit.ts' })

    expect(adapter).toMatchObject({ name: 'vitest', batch: true, version })
    await expect(adapter.start(context)).resolves.toBe(session)
    expect(startVitestSession).toHaveBeenCalledWith(context, {
      config: 'vitest.unit.ts',
    })

    await vitestAdapter().start(context)

    expect(startVitestSession).toHaveBeenLastCalledWith(context, {})
  })
})

describe('vitest adapter', () => {
  it('runs every mutant of a project isolated by default', async () => {
    let result = await runMutants({
      builtIns: createBuiltIns('vitest', vitestAdapter()),
      cwd: runnerRoot,
      paths: ['src'],
      concurrency: 2,
      cache: false,
    })

    expect(result.mode).toBe('isolated')
    expect(result.diagnostics).toStrictEqual([])
    // The timeout of `settle` is confirmed in a second isolated run.
    expect(result.runs).toStrictEqual({ isolated: 2, dry: 1 })
    expect(result.results.map(summarizeVerdict).toSorted()).toStrictEqual(
      [
        'src/around.ts | arithmetic-operator | value / 2 | Killed | isolated | - | assertion',
        'src/around.ts | number-literal | 3 | Killed | isolated | - | assertion',
        'src/collect.ts | arithmetic-operator | value / 3 | Killed | isolated | - | hook-error',
        'src/collect.ts | number-literal | 4 | Killed | isolated | - | hook-error',
        'src/counter.ts | assignment-operator | count -= 1 | Killed | isolated | - | assertion',
        'src/counter.ts | number-literal | 1 | Survived | isolated | static | -',
        'src/counter.ts | number-literal | 2 | Survived | isolated | - | -',
        'src/counter.ts | return-value | 0 | Killed | isolated | - | assertion',
        'src/limits.ts | arithmetic-operator | 3 / 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 5 | Killed | isolated | static | assertion',
        'src/math.ts | arithmetic-operator | left - right | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value != 0 | Survived | isolated | - | -',
        'src/math.ts | comparison-operator | value > 1 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value > 1 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Killed | isolated | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Survived | isolated | - | -',
        'src/math.ts | number-literal | 1 | Killed | isolated | - | assertion',
        'src/math.ts | update-operator | steps-- | Killed | isolated | - | assertion',
        'src/ready.ts | boolean-literal | false | Killed | isolated | - | assertion',
        'src/ready.ts | boolean-literal | true | Survived | isolated | static | -',
        'src/ready.ts | return-value | false | Killed | isolated | - | assertion',
        'src/ready.ts | return-value | true | Survived | isolated | - | -',
        'src/ready.ts | statement-removal | ; | Killed | isolated | - | assertion',
        'src/settle.ts | condition | false | Timeout | isolated | - | time-limit',
        'src/settle.ts | condition | true | Survived | isolated | - | -',
        'src/settle.ts | missing-await | new Promise(resolve => { setTimeout(resolve, Number(quick ? 1 : 4000)) }) | Survived | isolated | - | -',
        'src/settle.ts | number-literal | 2 | Survived | isolated | - | -',
        'src/settle.ts | number-literal | 4001 | NoCoverage | - | - | -',
        "src/settle.ts | string-literal | '' | Killed | isolated | - | assertion",
      ].toSorted(),
    )
  }, 30_000)

  it('runs the mutants of a project on the batch and isolated paths in fast mode', async () => {
    let result = await runMutants({
      builtIns: createBuiltIns('vitest', vitestAdapter()),
      cwd: runnerRoot,
      paths: ['src'],
      concurrency: 2,
      cache: false,
      fast: true,
    })

    expect(result.runner).toBe('vitest')
    expect(result.diagnostics).toStrictEqual([])
    expect(result.runs).toStrictEqual({
      confirmation: 1,
      isolated: 1,
      recovery: 1,
      batch: 1,
      dry: 1,
    })
    expect(result.results.map(summarizeVerdict).toSorted()).toStrictEqual(
      [
        // An aroundEach teardown assertion fails after the try.
        'src/around.ts | arithmetic-operator | value / 2 | Killed | batch | - | assertion',
        'src/around.ts | number-literal | 3 | Killed | batch | - | assertion',
        // An afterAll assertion fails after every test passed.
        'src/collect.ts | arithmetic-operator | value / 3 | Killed | isolated | doubtful | hook-error',
        'src/collect.ts | number-literal | 4 | Killed | isolated | doubtful | hook-error',
        // A test that does not reach the mutant sees the state it left.
        'src/counter.ts | assignment-operator | count -= 1 | Killed | isolated | batch-survivor | assertion',
        'src/counter.ts | number-literal | 1 | Survived | isolated | static | -',
        'src/counter.ts | number-literal | 2 | Survived | isolated | batch-survivor | -',
        'src/counter.ts | return-value | 0 | Killed | batch | - | assertion',
        'src/limits.ts | arithmetic-operator | 3 / 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 4 | Killed | isolated | static | assertion',
        'src/limits.ts | number-literal | 5 | Killed | isolated | static | assertion',
        'src/math.ts | arithmetic-operator | left - right | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value != 0 | Survived | isolated | batch-survivor | -',
        'src/math.ts | comparison-operator | value > 1 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value > 1 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Killed | batch | - | assertion',
        'src/math.ts | comparison-operator | value >= 0 | Survived | isolated | batch-survivor | -',
        'src/math.ts | number-literal | 1 | Killed | batch | - | assertion',
        'src/math.ts | update-operator | steps-- | Killed | batch | - | assertion',
        'src/ready.ts | boolean-literal | false | Killed | batch | - | assertion',
        'src/ready.ts | boolean-literal | true | Survived | isolated | static | -',
        'src/ready.ts | return-value | false | Killed | batch | - | assertion',
        'src/ready.ts | return-value | true | Survived | isolated | batch-survivor | -',
        // The control try before it left the flag set; a fresh module did not.
        'src/ready.ts | statement-removal | ; | Killed | isolated | batch-survivor | assertion',
        'src/settle.ts | condition | false | Timeout | batch | - | time-limit',
        'src/settle.ts | condition | true | Survived | isolated | batch-survivor | -',
        'src/settle.ts | missing-await | new Promise(resolve => { setTimeout(resolve, Number(quick ? 1 : 4000)) }) | Survived | isolated | batch-survivor | -',
        'src/settle.ts | number-literal | 2 | Survived | isolated | batch-survivor | -',
        'src/settle.ts | number-literal | 4001 | NoCoverage | - | - | -',
        "src/settle.ts | string-literal | '' | Killed | batch | - | assertion",
      ].toSorted(),
    )
    await expect(readdir(runnerRoot)).resolves.toStrictEqual([
      'lib',
      'src',
      'test',
      'vitest.config.ts',
    ])
  }, 30_000)

  it('reports controls, hung workers and crashes', async () => {
    let work = await createWorkDirectory()
    let session = await vitestAdapter({ config: 'vitest.config.ts' }).start({
      workDirectory: work.path,
      root: runnerRoot,
      concurrency: 2,
      files: [],
    })
    try {
      let behavior = path.join(runnerRoot, 'test/behavior.test.ts')
      let probe = path.join(runnerRoot, 'test/probe.test.ts')
      let math = path.join(runnerRoot, 'test/math.test.ts')

      await expect(session.listTestFiles()).resolves.toContain(probe)

      // Every test file depends on the Vitest configuration, so all of them run.
      let dry = await session.dryRun({
        related: [path.join(runnerRoot, 'vitest.config.ts')],
        timeouts: { file: 60_000, test: 60_000 },
        instrumented: true,
        repeat: true,
        files: null,
      })
      let ids = new Map(dry.tests.map(test => [test.name, test.id]))

      expect(dry.files.map(file => file.file)).toContain(probe)
      expect(dry.tests.find(test => test.name === 'spins')).toMatchObject({
        tries: [
          { covers: ['spin'], failed: false, mutant: null },
          { covers: ['spin'], failed: false, mutant: null },
        ],
        file: probe,
        line: 9,
      })

      expect(dry.tests.find(test => test.name === 'snapshots')).toMatchObject({
        tries: [
          {
            message: expect.stringMatching(/snapshot/iu) as string,
            failed: true,
          },
          { failed: true },
        ],
      })
      await expect(
        readdir(path.join(runnerRoot, 'test')),
      ).resolves.not.toContain('__snapshots__')

      let limits = { load: { hitLimit: 1000, timeout: 1000 }, total: 2000 }
      let batch = await session.runBatch({
        units: [
          {
            tests: [
              {
                id: ids.get('spins')!,
                mutants: ['spin'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: probe,
            limits,
          },
          {
            tests: [
              {
                mutants: ['fail', 'other'],
                id: ids.get('fails')!,
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: probe,
            limits,
          },
          {
            tests: [
              {
                mutants: ['skip', 'after'],
                id: ids.get('skips')!,
                hitLimit: 1000,
                timeout: 200,
              },
              {
                id: ids.get('fakes timers')!,
                mutants: ['sleep', 'later'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            file: behavior,
            project: '',
            limits,
          },
          {
            tests: [
              {
                id: ids.get('adds')!,
                mutants: ['other'],
                hitLimit: 1000,
                timeout: 200,
              },
            ],
            project: '',
            file: math,
            limits,
          },
        ],
      })

      let names = new Map(dry.tests.map(test => [test.id, test.name]))

      expect(batch.incomplete).toStrictEqual([
        { message: expect.any(String) as string, reason: 'hang', unit: 0 },
        {
          message: expect.any(String) as string,
          reason: 'abandoned',
          unit: 2,
        },
      ])
      expect(
        batch.tries.map(facts => [
          facts.unit,
          names.get(facts.test),
          facts.mutant,
          facts.failed,
          facts.timedOut,
          facts.skipped,
        ]),
      ).toStrictEqual([
        [0, 'spins', 'spin', false, true, false],
        [1, 'spins', null, false, false, false],
        [1, 'crashes', null, false, false, false],
        [1, 'fails', null, false, false, false],
        [1, 'fails', 'fail', true, false, false],
        [1, 'fails', null, false, false, false],
        [1, 'fails', 'other', false, false, false],
        [1, 'fails', null, false, false, false],
        [2, 'skips', null, false, false, false],
        [2, 'skips', 'skip', false, false, true],
        [2, 'fakes timers', null, false, false, false],
        [2, 'fakes timers', 'sleep', false, true, false],
        [3, 'adds', null, false, false, false],
        [3, 'adds', 'other', false, false, false],
        [3, 'adds', null, false, false, false],
      ])
      expect(batch.hookErrors).toStrictEqual([])

      let isolated = await session.runIsolated({
        units: [
          {
            limits: { hitLimit: 1000, timeout: 2000 },
            mutant: 'crash',
            project: '',
            file: probe,
          },
          {
            limits: { hitLimit: 1000, timeout: 2000 },
            mutant: 'fail',
            project: '',
            file: probe,
          },
        ],
      })

      expect(
        isolated.units
          .toSorted((left, right) => left.unit - right.unit)
          .map(unit => [
            unit.unit,
            unit.incomplete,
            unit.reached,
            unit.tests.map(facts => facts.failed),
          ]),
      ).toStrictEqual([
        [0, 'crash', false, [false]],
        [1, null, true, [false, false, true]],
      ])

      let hang = path.join(runnerRoot, 'test/hang.test.ts')
      let hung = await session.dryRun({
        related: [path.join(runnerRoot, 'lib/hang.ts')],
        timeouts: { file: 5000, test: 321 },
        instrumented: true,
        repeat: true,
        files: null,
      })

      expect(hung.hung).toStrictEqual([
        {
          test: ids.get('loops on the second call'),
          name: 'loops on the second call',
          file: hang,
        },
      ])
    } finally {
      await session.close()
      await session.close()
      await work.remove()
    }
  }, 30_000)
})

describe('verdict equivalence', () => {
  it('agrees with mutants applied by hand in the default and fast modes', async () => {
    let { original, isolated, fast, rows } = await runAllPaths(
      equivalenceRoot,
      sources,
    )

    expect(original).toBe(true)
    // Counting and collecting tests fail when each test runs twice, so in
    // fast mode their files are unrepeatable: a plain run of Vitest passes
    // them. The default mode tries each test once.
    expect(fast.diagnostics.map(describeDiagnostic)).toStrictEqual([
      'unrepeatable-test | test/collect.test.ts | 11',
      'unrepeatable-test | test/collect.test.ts | 15',
      'unrepeatable-test | test/counter.test.ts | 5',
      'unrepeatable-test | test/counter.test.ts | 9',
      'unrepeatable-test | test/tick.test.ts | 5',
    ])
    expect(isolated.diagnostics).toStrictEqual([])
    expect(isolated.mode).toBe('isolated')
    expect(fast.mode).toBe('fast')
    expect(isolated.results.map(result => result.mutant.id)).toStrictEqual(
      fast.results.map(result => result.mutant.id),
    )
    expect(isolated.results.every(result => result.path !== 'batch')).toBe(true)
    expect(isolated.runs).toStrictEqual({ isolated: 1, dry: 1 })

    expectAgreement(rows)
    expect(
      rows.filter(row =>
        [
          // A later test sees the state the mutant left, never reaching it.
          'src/counter.ts | assignment-operator | count -= 1',
          // The test passes on its retry, as in a plain run.
          'src/threshold.ts | number-literal | 2',
          // The control try before it left the flag set.
          'src/ready.ts | statement-removal | ;',
          // The afterAll assertion fails after every test passed.
          'src/collect.ts | number-literal | 4',
          // An aroundEach teardown assertion fails after the try.
          'src/around.ts | number-literal | 3',
          // Only the try that builds the table reaches the mutant.
          'src/lazy.ts | number-literal | 3',
          // The test repeats itself with Vitest's own `repeats`.
          'src/tick.ts | number-literal | 1',
          'src/tick.ts | number-literal | 2',
        ].includes(row.mutant),
      ),
    ).toHaveLength(8)
    expect(
      fast.results
        .filter(result => result.status === 'Survived')
        .every(result => result.path === 'isolated'),
    ).toBe(true)
  }, 60_000)

  it('keeps a mutant that only a stale value kills alive by default, and documents the heuristic kill of fast mode', async () => {
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'stale'),
      ['src/read.ts'],
    )
    // Without its reset the function returns what the last call left: 0 on
    // a fresh module, as by hand, but 1 after a control try of a batch run.
    let stale = 'src/read.ts | statement-removal | ;'

    expect(original).toBe(true)
    expect(rows.map(row => row.isolated)).toStrictEqual(
      rows.map(row => row.reference),
    )
    expect(rows.find(row => row.mutant === stale)).toStrictEqual({
      reference: 'survived',
      isolated: 'survived',
      fast: 'killed',
      mutant: stale,
    })
    expect(
      rows
        .filter(row => row.mutant !== stale)
        .every(row => row.fast === row.reference),
    ).toBe(true)
    let heuristic = fast.results.find(
      result => describeMutant(result) === stale,
    )!

    expect(heuristic).toMatchObject({ status: 'Killed', path: 'batch' })
    expect(
      isolated.results.find(result => describeMutant(result) === stale),
    ).toMatchObject({ isolatedBecause: null, status: 'Survived' })
  }, 60_000)

  it('counts errors of worker-scoped fixture cleanup against the mutant', async () => {
    // Only the cleanup of a worker-scoped fixture, after the test file ran,
    // sees the mutants of `release`. The fixture holds a fixed port until
    // then, so a unit that started before the worker of the unit before it
    // was gone would fail to listen.
    let { original, isolated, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'teardown'),
      ['src/pool.ts'],
      { separate: true },
    )

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expectAgreement(rows)
    expect(
      isolated.results.find(
        result =>
          describeMutant(result) ===
          'src/pool.ts | assignment-operator | open += 1',
      ),
    ).toMatchObject({ cause: 'hook-error', status: 'Killed' })
  }, 60_000)

  it('counts errors of the environment teardown against the mutant', async () => {
    // Only the environment's teardown, after the worker-scoped fixtures were
    // cleaned up, checks the resources the test left open or closed twice.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'environment'),
      ['src/pool.ts'],
      { separate: true },
    )
    let leaks = rows.filter(row => row.reference === 'killed')

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expect(fast.diagnostics).toStrictEqual([])
    expectAgreement(rows)
    expect(leaks).toHaveLength(5)
    expect(
      isolated.results
        .filter(result => result.cause === 'hook-error')
        .map(result => [describeMutant(result), result.message]),
    ).toStrictEqual([
      [
        'src/pool.ts | assignment-operator | getPool().open -= 1',
        '-2 left open',
      ],
      ['src/pool.ts | number-literal | 2', '1 left open'],
      [
        'src/pool.ts | assignment-operator | getPool().open += 1',
        '2 left open',
      ],
      ['src/pool.ts | number-literal | 2', '-1 left open'],
    ])
  }, 60_000)

  it('stops a worker whose environment teardown hangs with a mutant', async () => {
    // The environment's teardown waits for every resource to close, so it
    // never ends when the mutant leaves one open.
    let started = performance.now()
    let result = await runMutants({
      builtIns: createBuiltIns('vitest', vitestAdapter()),
      cwd: path.join(equivalenceRoot, 'stuck'),
      paths: ['src'],
      concurrency: 1,
      cache: false,
    })

    // Vitest stops waiting for a killed worker's answer only after a minute,
    // at the latest when the session closes.
    expect(performance.now() - started).toBeLessThan(40_000)

    expect(
      result.results.map(entry => [
        entry.mutant.replacement,
        entry.status,
        entry.cause,
      ]),
    ).toStrictEqual([
      [';', 'Timeout', 'hang'],
      ['1', 'Timeout', 'hang'],
    ])
    // Each mutant hangs again when its timeout is confirmed.
    expect(new Set(result.diagnostics.map(describeDiagnostic))).toStrictEqual(
      new Set(['worker-hang | test/pool.test.ts | ']),
    )
  }, 120_000)

  it('stops on an environment teardown that fails without mutants', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns('vitest', vitestAdapter()),
        cwd: path.join(equivalenceRoot, 'leaky'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow('Tests fail without mutants; fix them first')
  }, 30_000)

  it('keeps concurrent tests concurrent by default, and warns that fast mode does not', async () => {
    // Two concurrent tests take an async lock; only overlapping calls wait on
    // it, so running them one at a time misses three mutants.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'concurrent'),
      ['src/lock.ts'],
      { hangs: result => result.cause === 'hit-limit' },
    )
    let waits = 'src/lock.ts | missing-await | busy'
    let hangs = rows.filter(row => row.reference === 'hangs')

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expect(
      rows
        .filter(row => row.reference !== 'hangs')
        .every(
          row =>
            row.isolated === row.reference ||
            (row.isolated === 'Timeout' && row.reference === 'killed'),
        ),
    ).toBe(true)
    // An endless synchronous loop only the second caller enters.
    expect(hangs.map(row => [row.mutant, row.isolated])).toContainEqual([
      waits,
      'Timeout',
    ])
    expect(
      rows.find(
        row => row.mutant === 'src/lock.ts | comparison-operator | false',
      ),
    ).toMatchObject({ reference: 'killed', isolated: 'killed' })
    // The sequential dry run of fast mode never makes the second caller wait.
    expect(rows.find(row => row.mutant === waits)?.fast).toBe('survived')
    expect(
      fast.diagnostics.map(diagnostic => [diagnostic.code, diagnostic.file]),
    ).toStrictEqual([['config-overridden', 'test/lock.test.ts']])
  }, 90_000)

  it('stops a test that loops only when repeated in fast mode, which a plain run passes', async () => {
    let hang = path.join(equivalenceRoot, 'hang')
    let shortened = shortenDryRuns(vitestAdapter(), { file: 5000, test: 300 })
    let reference = await runReferenceMutants(hang, [], {
      sources: ['src/flag.ts'],
    })

    expect(reference.original).toBe(true)
    await expect(
      runMutants({
        builtIns: createBuiltIns('vitest', shortened),
        paths: ['src'],
        concurrency: 1,
        cache: false,
        fast: true,
        cwd: hang,
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "loops on repeat" in test/flag.test.ts',
    )

    let isolated = await runMutants({
      builtIns: createBuiltIns('vitest', shortened),
      paths: ['src'],
      concurrency: 1,
      cache: false,
      cwd: hang,
    })

    expect(isolated.results.map(classifyVerdict)).toStrictEqual(['killed'])
  }, 30_000)

  it('never runs a test file twice at once', async () => {
    // Every unit of the test file uses one fixed file, so two units that ran
    // at once would kill equivalent mutants or let a mutant survive.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'shared'),
      ['src/render.ts'],
    )

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expect(fast.diagnostics).toStrictEqual([])
    expectAgreement(rows)
    expect(
      rows.filter(row =>
        [
          'src/render.ts | comparison-operator | n >= 1',
          'src/render.ts | arithmetic-operator | n / 2',
        ].includes(row.mutant),
      ),
    ).toStrictEqual([
      expect.objectContaining({ reference: 'killed' }),
      expect.objectContaining({ reference: 'survived' }),
    ])
  }, 60_000)

  it('lets slow hooks use their own hook timeout in the dry run', async () => {
    let result = await runMutants({
      builtIns: createBuiltIns(
        'vitest',
        shortenDryRuns(vitestAdapter(), { file: 100, test: 100 }),
      ),
      cwd: path.join(equivalenceRoot, 'slow'),
      paths: ['src'],
      concurrency: 1,
      cache: false,
    })

    expect(result.results.map(classifyVerdict)).toStrictEqual(['killed'])
  }, 30_000)

  it('agrees with mutants applied by hand in Vue components and templates', async () => {
    // Scripts reach the Vue plugin in every form: inlined into the component
    // module, as the `?vue&type=script` request of a `tsx` script, and as an
    // external `<script src>` file. The card and the buttons are mounted in a
    // DOM, where their event handlers run.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'vue'),
      [
        'src/badge.vue',
        'src/card.vue',
        'src/counter.vue',
        'src/price.ts',
        'src/save.vue',
        'src/toggle.vue',
        'src/total.vue',
      ],
      {
        config: [
          "import vue from '@vitejs/plugin-vue'",
          '',
          'export default {',
          "  test: { include: ['*/test/**/*.test.ts'] },",
          '  plugins: [vue()],',
          '}',
          '',
        ].join('\n'),
      },
    )

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expect(fast.diagnostics).toStrictEqual([])
    expectAgreement(rows)
    expect(getKilledFiles(rows)).toStrictEqual(
      new Set([
        'src/counter.vue',
        'src/toggle.vue',
        'src/badge.vue',
        'src/total.vue',
        'src/card.vue',
        'src/save.vue',
        'src/price.ts',
      ]),
    )
    // Template mutants are switched and attributed to the tests that render
    // them: the `v-if` branch renders only after the clicks, and each handler
    // runs only in the test that clicks its button.
    let names = new Map(isolated.tests.map(test => [test.id, test.name]))
    let coverage = new Map(
      isolated.results
        .filter(result => result.mutant.scope === '<template>')
        .map(result => [
          result.mutant.replacement,
          [
            result.status,
            result.coveredBy
              .map(id => names.get(id)!)
              .toSorted(compareCodeUnits),
          ],
        ]),
    )

    expect(coverage.get('count / 2')).toStrictEqual([
      'Killed',
      ['counts clicks'],
    ])
    expect(coverage.get('count--')).toStrictEqual(['Killed', ['counts clicks']])
    expect(coverage.get('count++')).toStrictEqual([
      'Killed',
      ['adds one with the second button'],
    ])
    expect(coverage.get('""')).toStrictEqual([
      'Killed',
      [
        'adds one with the second button',
        'counts clicks',
        'lists the items without the skipped one',
      ],
    ])
    // No template mutant of the buttons is an Error: the rejected save still
    // reaches the error handler, the function handler compiles, and the
    // guard of its second statement leaves the condition whole.
    expect(
      isolated.results
        .filter(
          result =>
            result.mutant.file === 'src/save.vue' &&
            result.mutant.scope === '<template>',
        )
        .map(result => `${result.mutant.replacement} ${result.status}`),
    ).toStrictEqual([
      'save() Survived',
      'ready Killed',
      'count >= 0 Killed',
      'count != 0 Killed',
      'count > 1 Survived',
      'count += 2 NoCoverage',
      '3 NoCoverage',
      'count += 1 Killed',
      '2 Killed',
    ])
    // The compiler hoists the defaults of `withDefaults` out of `setup`, so
    // the mutant runs while the component module loads.
    expect(
      isolated.results.find(
        result =>
          describeMutant(result) === 'src/counter.vue | number-literal | 2',
      ),
    ).toMatchObject({ isolatedBecause: 'static', status: 'Killed' })
    // The compiler reads the model name as written, so only the labels of
    // the toggle are emptied.
    expect(
      rows.filter(row => row.mutant === "src/toggle.vue | string-literal | ''"),
    ).toHaveLength(2)
  }, 120_000)

  it('agrees with mutants applied by hand in Svelte components, templates and modules', async () => {
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(equivalenceRoot, 'svelte'),
      [
        'src/badge.svelte',
        'src/greeting.svelte',
        'src/stars.svelte',
        'src/tally.svelte.ts',
      ],
      {
        config: [
          "import { svelte } from '@sveltejs/vite-plugin-svelte'",
          '',
          'export default {',
          "  test: { include: ['*/test/**/*.test.ts'] },",
          '  plugins: [svelte({ configFile: false })],',
          '}',
          '',
        ].join('\n'),
      },
    )

    expect(original).toBe(true)
    expect(isolated.diagnostics).toStrictEqual([])
    expect(fast.diagnostics).toStrictEqual([])
    expectAgreement(rows)
    expect(getKilledFiles(rows)).toStrictEqual(
      new Set([
        'src/greeting.svelte',
        'src/tally.svelte.ts',
        'src/stars.svelte',
        'src/badge.svelte',
      ]),
    )
    // Template mutants are switched and attributed to the tests that render
    // them: each branch of the `{#if}` renders in one test only.
    let names = new Map(isolated.tests.map(test => [test.id, test.name]))
    let coverage = new Map(
      isolated.results
        .filter(result => result.mutant.scope === '<template>')
        .map(result => [
          `${result.mutant.file} ${result.mutant.replacement}`,
          [
            result.status,
            result.coveredBy
              .map(id => names.get(id)!)
              .toSorted(compareCodeUnits),
          ],
        ]),
    )

    expect(coverage.get('src/badge.svelte label.toLowerCase()')).toStrictEqual([
      'Killed',
      ['shows the label without a count'],
    ])
    expect(coverage.get('src/badge.svelte count == 10')).toStrictEqual([
      'Killed',
      ['shows the count'],
    ])
    expect(coverage.get('src/badge.svelte count >= 0')).toStrictEqual([
      'Killed',
      ['shows the count', 'shows the label without a count'],
    ])
    expect(coverage.get("src/stars.svelte ''")).toStrictEqual([
      'Killed',
      ['draws a star per point'],
    ])
    // Svelte accepts the rune only at the top level of the constructor.
    expect(
      rows.filter(row =>
        row.mutant.startsWith('src/tally.svelte.ts | statement-removal'),
      ),
    ).toStrictEqual([])
  }, 60_000)

  it('runs the test file named after the module first, takes its verdict first, and stops a unit at its first kill', async () => {
    // `test/scale.test.ts` is named after `src/scale.ts` but is the slowest
    // file; `test/cheap.test.ts` imports it directly and kills nothing;
    // `test/format.test.ts` reaches it through `src/format.ts`. The second
    // test of `test/scale.test.ts` loops for every mutant its first test
    // kills, so a unit that went on after the kill would time out.
    let rounds = path.join(equivalenceRoot, 'rounds')
    let result = await runMutants({
      builtIns: createBuiltIns('vitest', vitestAdapter()),
      paths: ['src'],
      concurrency: 2,
      cache: false,
      cwd: rounds,
    })
    let scale = result.results.filter(
      entry => entry.mutant.file === 'src/scale.ts',
    )
    let names = new Map(result.tests.map(test => [test.id, test.name]))
    let survivors = scale.filter(entry => entry.status === 'Survived')
    let unit = scale.find(entry => entry.mutant.replacement === "''")!

    expect(result.diagnostics).toStrictEqual([])
    expect(result.results.map(entry => entry.status)).not.toContain('Timeout')
    expect(
      scale
        .filter(entry => entry.status === 'Killed' && entry !== unit)
        .map(entry => [
          names.get(entry.killedBy!),
          path.relative(rounds, entry.killedIn!),
          entry.cause,
          entry.tries,
        ]),
    ).toStrictEqual(
      scale
        .filter(entry => entry.status === 'Killed' && entry !== unit)
        .map(() => ['doubles', 'test/scale.test.ts', 'assertion', 1]),
    )
    // The cheaper files reach the static mutant too, but the first round
    // takes only the file named after the module, which kills it.
    expect(unit).toMatchObject({
      isolatedBecause: 'static',
      status: 'Killed',
      tries: 1,
    })
    expect(path.relative(rounds, unit.killedIn!)).toBe('test/scale.test.ts')
    // A survivor runs every file that reaches it, one more in each round.
    expect(survivors.length).toBeGreaterThan(0)
    expect(survivors.every(entry => entry.tries === 3)).toBe(true)
    expect(result.runs.isolated).toBe(3)
  }, 60_000)

  it('gives Error to mutants that only a global setup runs', async () => {
    let result = await runMutants({
      builtIns: createBuiltIns('vitest', vitestAdapter()),
      cwd: path.join(equivalenceRoot, 'global'),
      paths: ['src'],
      concurrency: 2,
      cache: false,
    })

    // A plain Vitest run fails with the first three: the global setup
    // provides the port the test checks. Mootant cannot switch code in the
    // main process, so it reports no verdict rather than NoCoverage.
    expect(
      result.results.map(entry => [entry.mutant.replacement, entry.status]),
    ).toStrictEqual([
      ['4000 - 1', 'Error'],
      ['4001', 'Error'],
      ['2', 'Error'],
      ["''", 'Killed'],
    ])
    expect(result.diagnostics.map(describeDiagnostic)).toStrictEqual([
      'outside-workers | src/port.ts | ',
    ])
  }, 30_000)

  it('skips only the message mutants of logging calls and runs the rest as by hand', async () => {
    let directory = path.join(equivalenceRoot, 'logging')
    let { original, isolated, rows } = await runAllPaths(directory, [
      'src/report.ts',
    ])
    let listing = await listMutants({
      paths: ['src'],
      cwd: directory,
      skipped: true,
    })
    let { skipped, source } = listing.files[0]!

    expect(original).toBe(true)
    expectAgreement(rows)
    // Texts of messages and removals of global console calls with plain
    // arguments are skipped, and never run.
    expect(
      skipped
        .filter(entry => entry.rule === 'log-message')
        .map(entry => [
          source!.slice(entry.start, entry.end),
          entry.replacement,
        ]),
    ).toStrictEqual([
      ["'skipped'", "''"],
      ["console.warn('done')", ';'],
      ["'done'", "''"],
      ["'sent'", "''"],
      ["'done'", "''"],
      ['console.error()', ';'],
      ["'ready'", "''"],
    ])
    // The rest runs like other code: the branch of a template, removals whose
    // argument or receiver throws, `?.`, format directives, also escaped, and
    // the messages of a `log` function the file declares and of a `console`
    // parameter, and the removal of a call of a parameter that may be null.
    expect(
      isolated.results.map(result => [
        source!.slice(result.mutant.start, result.mutant.end),
        result.mutant.replacement,
        result.status,
      ]),
    ).toStrictEqual([
      [
        `\`found \${count} \${count === 1 ? 'entry' : 'entries'}\``,
        `\`\${count}\${count === 1 ? 'entry' : 'entries'}\``,
        'Killed',
      ],
      ['count === 1', 'count <= 1', 'Survived'],
      ['count === 1', 'count >= 1', 'Killed'],
      ['count === 1', 'false', 'Survived'],
      ["'entry'", "''", 'NoCoverage'],
      ["'entries'", "''", 'Killed'],
      ["console.warn('skipped', reason)", ';', 'Survived'],
      ['reason.length', '0', 'Killed'],
      ['console.log(user.name)', ';', 'Killed'],
      ["context.logger.info('sent')", ';', 'Killed'],
      ["logger?.info('done')", "logger.info('done')", 'Killed'],
      ["logger?.info('done')", ';', 'Survived'],
      ["'finished'", "''", 'Killed'],
      ["'%j'", "''", 'Killed'],
      ['`\\x25j`', '``', 'Killed'],
      ['[]', '[undefined]', 'Killed'],
      ['entries.push(text)', ';', 'Killed'],
      ["'built'", "''", 'Killed'],
      ["logger.info('ready')", ';', 'Killed'],
      ["'kept'", "''", 'Killed'],
    ])
  }, 60_000)
})

describe('vitest adapter with the cache', () => {
  afterEach(async () => {
    delete process.env['MOOTANT_LOUD']
    delete process.env['MOOTANT_OTHER']
    for (let [name, value] of Object.entries(variables)) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
    await Promise.all(
      copies.splice(0).map(copy => rm(copy, { recursive: true, force: true })),
    )
  })

  it('reuses every verdict of an unchanged project', async () => {
    let root = await copyFixture()
    let first = await run(root)
    let second = await run(root)

    expect(first.result.cache).toBe(true)
    expect(first.result.diagnostics).toStrictEqual([])
    expect(first.result.results.some(entry => entry.cached)).toBe(false)
    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/limit.ts', 'src/size.ts'],
      ran: [],
    })
    expect(second.result.runs).toStrictEqual({ dry: 1 })
    expect(second.units).toBe(0)
  }, 60_000)

  it('runs the mutants of a changed source file again', async () => {
    let root = await copyFixture()
    await run(root)
    await appendFile(
      path.join(root, 'src/limit.ts'),
      '\nexport let unused = 1\n',
    )
    let { result } = await run(root)
    let size = result.results.filter(
      entry => entry.mutant.file === 'src/size.ts',
    )
    let survivors = size.filter(entry => entry.status === 'Survived')
    let kills = size.filter(
      entry => entry.killedIn?.endsWith('size.test.ts') === true,
    )

    expect(
      result.results
        .filter(entry => entry.mutant.file === 'src/limit.ts')
        .some(entry => entry.cached),
    ).toBe(false)
    expect(survivors.length).toBeGreaterThan(0)
    expect(kills.length).toBeGreaterThan(0)
    // Their other test file loads the changed file, so only that unit runs.
    expect(survivors.every(entry => !entry.cached && entry.tries === 1)).toBe(
      true,
    )
    expect(kills.every(entry => entry.cached)).toBe(true)
  }, 60_000)

  it('runs only the units of a changed test file again', async () => {
    let root = await copyFixture()
    let first = await run(root)
    await appendFile(path.join(root, 'test/limit.test.ts'), '// changed\n')
    let second = await run(root)
    let survivors = second.result.results.filter(
      entry => entry.status === 'Survived',
    )

    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(survivors.length).toBeGreaterThan(0)
    for (let survivor of survivors) {
      expect(survivor).toMatchObject({ cached: false, tries: 1 })
    }
    expect(
      second.result.results.find(
        entry => entry.mutant.replacement === 'value / 2',
      ),
    ).toMatchObject({ status: 'Killed', cached: true, tries: 0 })
    expect(second.units).toBeLessThan(first.units)
  }, 60_000)

  it('runs the units of a test file again when its snapshot changes', async () => {
    let root = await copyFixture()
    await run(root)
    await appendFile(
      path.join(root, 'test/__snapshots__/size.test.ts.snap'),
      '// changed\n',
    )
    let { result } = await run(root)

    expect(
      result.results.find(entry => entry.mutant.replacement === 'value / 2'),
    ).toMatchObject({ status: 'Killed', cached: false })
    expect(
      result.results.find(
        entry => entry.mutant.replacement === 'Math.max(value, 100)',
      ),
    ).toMatchObject({ status: 'Killed', cached: true })
  }, 60_000)

  it('runs every mutant again when the test runner configuration changes', async () => {
    let root = await copyFixture()
    await run(root)
    await appendFile(path.join(root, 'vitest.config.ts'), '// changed\n')
    let { result } = await run(root)

    expect(splitCached(result)).toStrictEqual({
      ran: ['src/limit.ts', 'src/size.ts'],
      cached: [],
    })
  }, 60_000)

  it('neither reads nor writes the cache when it is off', async () => {
    let root = await copyFixture()
    let file = getCachePath(root)
    await run(root)
    let saved = await readFile(file, 'utf8')
    let { result } = await run(root, { cache: false })

    expect(result.cache).toBe(false)
    expect(result.results.some(entry => entry.cached)).toBe(false)
    await expect(readFile(file, 'utf8')).resolves.toBe(saved)
  }, 60_000)

  it('reuses batch kills in fast mode only', async () => {
    let root = await copyFixture()
    let first = await run(root, { fast: true })
    let second = await run(root, { fast: true })
    let isolated = await run(root)
    let batchKills = first.result.results.filter(
      entry => entry.path === 'batch',
    )

    expect(batchKills.length).toBeGreaterThan(0)
    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(second.result.runs).toStrictEqual({ dry: 1 })
    for (let kill of batchKills) {
      expect(
        isolated.result.results.find(
          entry => entry.mutant.id === kill.mutant.id,
        ),
      ).toMatchObject({ path: 'isolated', status: 'Killed', cached: false })
    }
    let survivors = isolated.result.results.filter(
      entry => entry.status === 'Survived',
    )

    expect(survivors.every(entry => entry.cached)).toBe(true)
  }, 60_000)

  it('runs mutants again after a change of a file loaded outside Vite', async () => {
    let root = await copyFixture(inputsFixture)
    await run(root)
    let unchanged = await run(root)

    expect(unchanged.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: ['src/route.ts'],
      ran: [],
    })
    await [
      'test/seed.ts',
      'test/inner.cjs',
      'src/deep.ts',
      'configs/base.json',
      'test/tsconfig.json',
    ].reduce(async (previous, file) => {
      await previous
      await (file === 'test/tsconfig.json' ?
        writeFile(path.join(root, file), '{ "extends": "../tsconfig.json" }\n')
      : appendFile(path.join(root, file), '\n// changed\n'))
      await setTimeout(5)
      let changed = await run(root)
      let again = await run(root)

      expect({ ...splitCached(changed.result), file }).toStrictEqual({
        ran: ['src/route.ts'],
        cached: [],
        file,
      })
      expect({ ...splitCached(again.result), file }).toStrictEqual({
        cached: ['src/route.ts'],
        ran: [],
        file,
      })
    }, Promise.resolve())
  }, 120_000)

  it('runs a kill of a unit that stopped at it again after a change of what the tests it skipped read', async () => {
    let root = await copyFixture(bailFixture)
    let first = await run(root)
    let unchanged = await run(root)
    let kills = first.result.results.filter(entry => entry.status === 'Killed')

    expect(first.result.diagnostics).toStrictEqual([])
    expect(kills.length).toBeGreaterThan(0)
    let names = new Map(first.result.tests.map(test => [test.id, test.name]))

    expect(
      new Set(kills.map(entry => names.get(entry.killedBy!))),
    ).toStrictEqual(new Set(['halves']))
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: ['src/half.ts'],
      ran: [],
    })

    await writeFile(
      path.join(root, 'test/late.json'),
      '{ "expected": 5, "value": 10 }\n',
    )
    await setTimeout(5)
    let changed = await run(root)

    expect(splitCached(changed.result)).toStrictEqual({
      ran: ['src/half.ts'],
      cached: [],
    })
    expect(changed.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
  }, 60_000)

  it('decides from a cached kill like a fresh run once an earlier file runs again', async () => {
    let root = await copyFixture(rankFixture)
    let first = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(
      new Set(first.result.results.map(entry => entry.status)),
    ).toStrictEqual(new Set(['Killed']))

    await writeLoopingScaleTest(root)
    await setTimeout(5)
    let cached = await run(root)
    let fresh = await run(root, { cache: false })

    expect(
      cached.result.results.filter(entry => entry.status === 'Timeout'),
    ).not.toStrictEqual([])
    expect(cached.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      fresh.result.results.map(summarizeCachedVerdict),
    )
    expect(cached.units).toBe(2)
  }, 60_000)

  it('reuses a batch kill in fast mode only after the tests tried before it pass', async () => {
    let root = await copyFixture(rankFixture)
    let first = await run(root, { fast: true })

    expect(first.result.diagnostics).toStrictEqual([])
    expect(
      new Set(first.result.results.map(entry => entry.status)),
    ).toStrictEqual(new Set(['Killed']))

    let unchanged = await run(root, { fast: true })

    expect(unchanged.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(unchanged.result.runs).toStrictEqual({ dry: 1 })

    await writeLoopingScaleTest(root)
    await setTimeout(5)
    let cached = await run(root, { fast: true })
    let fresh = await run(root, { cache: false, fast: true })

    expect(
      cached.result.results.filter(entry => entry.status === 'Timeout'),
    ).not.toStrictEqual([])
    expect(cached.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      fresh.result.results.map(summarizeCachedVerdict),
    )
  }, 60_000)

  it('runs mutants again after a change of what tests read at runtime', async () => {
    let root = await copyFixture(runtimeFixture)
    process.env['MOOTANT_LOUD'] = '0'
    process.env['MOOTANT_OTHER'] = 'a'
    let first = await run(root)
    let unchanged = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: ['src/greet.ts', 'src/pick.ts', 'src/price.ts'],
      ran: [],
    })

    process.env['MOOTANT_OTHER'] = 'b'
    let unread = await run(root)

    expect(splitCached(unread.result).ran).toStrictEqual([])

    process.env['MOOTANT_LOUD'] = '1'
    let read = await run(root)

    expect(splitCached(read.result)).toStrictEqual({
      cached: ['src/pick.ts', 'src/price.ts'],
      ran: ['src/greet.ts'],
    })

    await writeFile(
      path.join(root, 'test/data.json'),
      '{ "base": 4, "expected": 8 }\n',
    )
    await setTimeout(5)
    let data = await run(root)

    expect(splitCached(data.result)).toStrictEqual({
      cached: ['src/greet.ts', 'src/pick.ts'],
      ran: ['src/price.ts'],
    })

    // The `if (flag)` → `if (false)` mutants load `lib/extra.*`; the first is
    // in `pickImport`, the second in `pickRequire`.
    let loading = first.result.results
      .filter(
        entry =>
          entry.mutant.file === 'src/pick.ts' &&
          entry.mutant.replacement === 'false',
      )
      .toSorted((left, right) => left.mutant.start - right.mutant.start)
      .map(entry => entry.mutant.id)

    expect(loading).toHaveLength(2)

    await ['lib/extra.js', 'lib/extra.cjs'].reduce(async (previous, file) => {
      await previous
      await appendFile(path.join(root, file), '\n// changed\n')
      await setTimeout(5)
      let { result } = await run(root)
      let ran = result.results
        .filter(entry => entry.status !== 'NoCoverage' && !entry.cached)
        .map(entry => entry.mutant.id)

      expect({ file, ran }).toStrictEqual({
        ran: [loading[file === 'lib/extra.js' ? 0 : 1]],
        file,
      })
    }, Promise.resolve())
  }, 120_000)

  it('keeps the cache of tests with side effects true to what they read', async () => {
    let root = await copyFixture(effectsFixture)
    let all = [
      'src/child.ts',
      'src/config.ts',
      'src/copy.ts',
      'src/golden.ts',
      'src/listing.ts',
    ]
    process.env['MOOTANT_PROVIDE'] = 'p'
    process.env['MOOTANT_DEFINE'] = 'd'
    process.env['MOOTANT_CHILD'] = 'a'
    let first = await run(root)
    let unchanged = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(first.result)).toStrictEqual({ cached: [], ran: all })
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: all,
      ran: [],
    })

    process.env['TERM_SESSION_ID'] = 'mootant'
    process.env['OLDPWD'] = root
    process.env['SHLVL'] = '99'
    let volatile = await run(root)

    expect(splitCached(volatile.result).ran).toStrictEqual([])

    process.env['MOOTANT_CHILD'] = 'b'
    let child = await run(root)

    expect(splitCached(child.result).ran).toStrictEqual([
      'src/child.ts',
      'src/listing.ts',
    ])

    await writeFile(
      path.join(root, 'test/fx/values.json'),
      '{ "values": [2, 2], "total": 4 }\n',
    )
    await appendFile(path.join(root, 'test/golden.txt'), 'changed\n')
    await setTimeout(5)
    let files = await run(root)

    expect(splitCached(files.result).ran).toStrictEqual([
      'src/copy.ts',
      'src/golden.ts',
    ])

    await writeFile(path.join(root, 'test/list/new.txt'), 'new\n')
    await setTimeout(5)
    let listed = await run(root)

    expect(splitCached(listed.result).ran).toStrictEqual(['src/copy.ts'])

    process.env['MOOTANT_DEFINE'] = 'e'
    let define = await run(root)

    expect(splitCached(define.result).ran).toStrictEqual(all)

    process.env['MOOTANT_PROVIDE'] = 'q'
    let provide = await run(root)

    expect(splitCached(provide.result).ran).toStrictEqual(all)
    expect(provide.result.diagnostics).toStrictEqual([])
  }, 180_000)

  it('keeps what teardown and recursive listings read in the cache keys', async () => {
    let root = await copyFixture(teardownFixture)
    await symlink('../../shared', path.join(root, 'test/tree/data'))
    await setTimeout(5)
    let all = ['src/fixture.ts', 'src/flag.ts', 'src/tree.ts']
    let keyed = ['src/fixture.ts', 'src/tree.ts']
    process.env['MOOTANT_FIXTURE'] = 'a'
    let first = await run(root)
    let unchanged = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(first.result)).toStrictEqual({ cached: [], ran: all })
    expect(splitCached(unchanged.result)).toStrictEqual({
      ran: ['src/flag.ts'],
      cached: keyed,
    })

    await writeFile(path.join(root, 'report.txt'), 'report\n')
    await setTimeout(5)
    let unrelated = await run(root)

    expect(splitCached(unrelated.result).ran).toStrictEqual(['src/flag.ts'])

    await writeFile(path.join(root, 'test/tree/sub/c.txt'), 'c\n')
    await setTimeout(5)
    let nested = await run(root)
    let again = await run(root)

    expect(splitCached(nested.result).ran).toStrictEqual([
      'src/flag.ts',
      'src/tree.ts',
    ])
    expect(splitCached(again.result).ran).toStrictEqual(['src/flag.ts'])

    await writeFile(path.join(root, 'shared/e.txt'), 'e\n')
    await setTimeout(5)
    let linked = await run(root)

    expect(splitCached(linked.result).ran).toStrictEqual([
      'src/flag.ts',
      'src/tree.ts',
    ])

    await writeFile(path.join(root, 'test/fixture.txt'), 'changed\n')
    await setTimeout(5)
    let fixtureFile = await run(root)

    expect(splitCached(fixtureFile.result).ran).toStrictEqual([
      'src/fixture.ts',
      'src/flag.ts',
    ])

    process.env['MOOTANT_FIXTURE'] = 'b'
    let fixtureVariable = await run(root)

    expect(splitCached(fixtureVariable.result).ran).toStrictEqual([
      'src/fixture.ts',
      'src/flag.ts',
    ])
    expect(fixtureVariable.result.diagnostics).toStrictEqual([])
  }, 180_000)
})
