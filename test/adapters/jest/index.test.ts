import type { ChildProcess } from 'node:child_process'

import {
  appendFile,
  writeFile,
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  stat,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { AdapterSession } from '../../../types/adapter/adapter-session'
import type { DryRunRequest } from '../../../types/adapter/dry-run-request'
import type { DryRunResult } from '../../../types/adapter/dry-run-result'
import type { SwitchedFile } from '../../../types/adapter/switched-file'
import type { TestAdapter } from '../../../types/adapter/test-adapter'
import type { MutantResult } from '../../../types/run/mutant-result'
import type { RunResult } from '../../../types/run/run-result'

import { createJestProject } from '../../helpers/create-jest-project'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { getCachePath } from '../../../core/cache/get-cache-path'
import { getTestId } from '../../../adapters/shared/get-test-id'
import { classifyVerdict } from '../../helpers/classify-verdict'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { shortenDryRuns } from '../../helpers/shorten-dry-runs'
import { describeMutant } from '../../helpers/describe-mutant'
import { jestAdapter } from '../../../adapters/jest/index'
import { runReference } from '../../helpers/run-reference'
import { runMutants } from '../../../core/run-mutants'
import { version } from '../../../package.json'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

vi.mock(
  import('../../../adapters/jest/run-on-worker'),
  async importOriginal => {
    let actual = await importOriginal()
    return { runOnWorker: vi.fn(actual.runOnWorker) }
  },
)

/**
 * Text with mutants of `src/math.js` of the `dry` fixture, written by hand.
 */
const SWITCHED = `globalThis.__mootant.hit('at-load')

exports.add = (a, b) => {
  globalThis.__mootant.hit('in-add')
  return a + b
}

exports.double = value => {
  globalThis.__mootant.hit('in-double')
  return value * 2
}
`

/**
 * Mutants that run into Jest's own timeout, which is a failed test in plain
 * Jest and `Timeout` here, since the core reads a test's `timedOut` that way.
 */
const OWN_TIMEOUT = [
  // The promise of the test never settles.
  'src/waiter.js | condition | false',
]

/**
 * The mutant that rejects a promise `beforeAll` handles a turn later.
 */
const LATE_REJECTION = 'src/deferred.js | condition | false'

/**
 * Sources of the `transforms` fixture that the Jest configuration keeps out of
 * the transform, whose mutants read as not covered, while plain Jest runs each
 * mutant as written and kills some.
 */
const KEPT_OUT = new Set([
  // `transformIgnorePatterns` names its directory, so mootant never serves it.
  'src/generated/words.js',
])

/**
 * Test files of the `projects` fixture that reach each source file.
 */
const PROJECT_TESTS: Record<string, string[]> = {
  'src/limits.js': ['test/server/limits.test.js'],
  'src/status.js': ['test/server/status.test.js'],
  'src/badge.js': ['test/browser/badge.test.js'],
  'src/title.js': ['test/title.test.js'],
}

/**
 * How both runs take the TypeScript file of the `transforms` fixture: with its
 * configuration of no transformer.
 */
const TYPED = {
  adapter: jestAdapter({ command: 'jest --config jest.typed.config.js' }),
  jestFlags: ['--config', 'jest.typed.config.js'],
  testFiles: () => ['typed/area.test.ts'],
  paths: ['typed/area.ts'],
}

/**
 * Test files of the `logging` fixture: the whole suite runs for each mutant, as
 * the test script runs it, since a run of one test file gets another console.
 */
const LOGGING_TESTS = [
  'test/loud/greet.test.js',
  'test/report.test.js',
  'test/count.test.js',
  'test/hang.test.js',
]

/**
 * Mutants of the `leftovers` fixture whose test passes and leaves something
 * that a plain run fails or never ends on only where its process goes on: in
 * band, as the second value says, in the order of a run, and for the late
 * errors also in a parallel run with another file after it on that worker. A
 * plain run of that file alone on a worker that then ends says what these rows
 * read: survived.
 */
const IN_BAND_ONLY = [
  // A timer ends the process after its file ended.
  ['src/exit-leaves.js | boolean-literal | true', 'killed'],
  // An interval keeps the process from ending.
  ['src/interval-leaves.js | boolean-literal | true', 'Timeout'],
  // A server keeps the process from ending.
  ['src/port-leaves.js | boolean-literal | true', 'Timeout'],
  // A rejection comes after its file ended, with no test to fail.
  ['src/rejection-leaves.js | boolean-literal | true', 'killed'],
  // A timer throws after its file ended, with no test to fail.
  ['src/timer-leaves.js | boolean-literal | true', 'killed'],
]

/**
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = ([30, 29] as const).filter(major =>
  [String(major), undefined].includes(process.env['MOOTANT_TEST_JEST']),
)

/**
 * Directories of the current test, removed after it.
 */
let directories: string[] = []

/**
 * Sessions of the current test, closed after it.
 */
let closes: (() => Promise<unknown>)[] = []

/**
 * Runs the mutants of a fixture with mootant and by hand, where each source
 * file `src/<name>.<ext>` is reached only by `test/<name>.test.<ext>`, unless
 * the options say which test files reach it.
 *
 * @param root - Root of the copy of the fixture.
 * @param options - What differs from two workers, the default adapter and a new
 *   reference run.
 * @param options.reference - Verdicts by hand of an earlier run of the fixture.
 * @param options.testFiles - Lists the test files that reach a source file.
 * @param options.concurrency - Workers of the run, or null for the project's
 *   own.
 * @param options.adapter - What runs the mutants.
 * @param options.nodeFlags - Node flags of the run by hand, which a test script
 *   would give in `NODE_OPTIONS`.
 * @param options.jestFlags - More flags of Jest in the run by hand.
 * @param options.paths - Files to mutate.
 * @returns Mootant's run, the verdicts by hand, and a row per mutant: its
 *   description, its verdict reduced by `classifyVerdict` and its verdict by
 *   hand.
 */
async function runBothWays(
  root: string,
  options: {
    reference?: Awaited<ReturnType<typeof runReference>>
    testFiles?(file: string): string[]
    concurrency?: number | null
    adapter?: TestAdapter
    nodeFlags?: string[]
    jestFlags?: string[]
    paths?: string[]
  } = {},
): Promise<{
  rows: { reference: string; verdict: string; mutant: string }[]
  reference: Awaited<ReturnType<typeof runReference>>
  result: Awaited<ReturnType<typeof runMutants>>
  original: boolean
}> {
  let { concurrency = 2, nodeFlags = [], jestFlags = [] } = options
  let result = await runMutants({
    builtIns: createBuiltIns('jest', options.adapter ?? jestAdapter()),
    ...(concurrency !== null && { concurrency }),
    paths: options.paths ?? ['src'],
    cache: false,
    cwd: root,
  })
  let reference =
    options.reference ??
    (await runReference(
      root,
      result.results.map(entry => entry.mutant),
      {
        testFiles:
          options.testFiles ??
          (file => {
            let extension = path.extname(file)
            return [`test/${path.basename(file, extension)}.test${extension}`]
          }),
        args: [...nodeFlags, ...createReferenceArguments(root), ...jestFlags],
        node: process.execPath,
        timeout: 20_000,
      },
    ))
  return {
    rows: result.results.map(entry => ({
      reference: reference.verdicts.get(entry.mutant.id)!,
      verdict: classifyVerdict(entry),
      mutant: describeMutant(entry),
    })),
    original: reference.original,
    reference,
    result,
  }
}

/**
 * Checks a run of the `leftovers` fixture: nothing reads `Error`, no process is
 * left, what plain Jest decides the same way in band and in parallel equals the
 * run by hand, and what it does not survives. So nothing left behind turned
 * into a kill, in the file that left it or in the next one.
 *
 * @param run - What `runBothWays` gave.
 */
function checkLeftovers(run: Awaited<ReturnType<typeof runBothWays>>): void {
  let names = new Set(IN_BAND_ONLY.map(([mutant]) => mutant))
  let compared = run.rows.filter(row => !names.has(row.mutant))
  let plain = run.result.results.filter(entry =>
    entry.mutant.file.endsWith('-plain.js'),
  )

  expect(run.original).toBe(true)
  expect(
    run.result.results.filter(entry => entry.status === 'Error'),
  ).toStrictEqual([])
  expect(compared).toStrictEqual(
    compared.map(row => ({ ...row, verdict: row.reference })),
  )
  expect(run.rows.filter(row => names.has(row.mutant))).toStrictEqual(
    IN_BAND_ONLY.map(([mutant, reference]) => ({
      verdict: 'survived',
      reference,
      mutant,
    })),
  )
  expect(new Set(plain.map(entry => entry.cause ?? '-'))).toStrictEqual(
    new Set(['assertion', '-']),
  )
  expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
}

/**
 * Starts a real session on a project, closing it after the test.
 *
 * @param root - Root of the project.
 * @returns The session, the files it reads, what it wrote, and the units that
 *   ended.
 */
async function start(root: string): Promise<{
  output: { file: string | null; text: string }[]
  session: AdapterSession
  ends: { count: number }
  files: SwitchedFile[]
}> {
  let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
  directories.push(workDirectory)
  let output: { file: string | null; text: string }[] = []
  let files: SwitchedFile[] = []
  let ends = { count: 0 }
  let session = await jestAdapter().start({
    onOutput: (text, file) => {
      output.push({ file, text })
    },
    onUnitEnd: () => {
      ends.count += 1
    },
    concurrency: 2,
    workDirectory,
    files,
    root,
  })
  closes.push(session.close)
  return { session, output, files, ends }
}

/**
 * Runs the mutants of a copy of the `cache` fixture with the cache, unless the
 * options turn it off, and counts the isolated units.
 *
 * @param root - Root of the copy.
 * @param options - Whether the run uses the cache, which it does when omitted,
 *   and how many workers it has, two when omitted.
 * @param options.concurrency - Number of workers.
 * @param options.cache - Whether the run uses the cache.
 * @returns Result of the run and the isolated units it ran.
 */
async function runCached(
  root: string,
  options: { concurrency?: number; cache?: boolean } = {},
): Promise<{ result: RunResult; units: number }> {
  let units = 0
  let result = await runMutants({
    onProgress: event => {
      if (event.kind === 'run-start' && event.run === 'isolated') {
        units += event.units
      }
    },
    builtIns: createBuiltIns('jest', jestAdapter()),
    paths: ['src'],
    concurrency: 2,
    cwd: root,
    ...options,
  })
  return { result, units }
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
 * Closes the sessions of the current test and removes its directories.
 */
async function cleanUp(): Promise<void> {
  await Promise.all(closes.map(close => close()))
  /* Cspell:disable-next-line */
  vi.unstubAllEnvs()
  await Promise.all(
    directories.map(directory =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
  closes = []
  directories = []
  vi.mocked(fork).mockClear()
  vi.mocked(runOnWorker).mockClear()
}

/**
 * Lists the status, cause and reason to run isolated of the mutants with the
 * given descriptions.
 *
 * @param results - Verdicts of a run.
 * @param mutants - Descriptions by `describeMutant`.
 * @returns Description, status, cause and why the mutant ran isolated, per
 *   verdict in run order.
 */
function pick(results: MutantResult[], mutants: string[]): string[] {
  return results
    .filter(result => mutants.includes(describeMutant(result)))
    .map(result =>
      [
        describeMutant(result),
        result.status,
        result.cause ?? '-',
        result.isolatedBecause ?? '-',
      ].join(' | '),
    )
}

/**
 * Lists the arguments of Node for an in-band plain run of Jest.
 *
 * @param root - Root of a copy of a fixture.
 * @returns Jest's binary with its flags.
 */
function createReferenceArguments(root: string): string[] {
  return [
    path.join(root, 'node_modules/jest/bin/jest.js'),
    '--ci',
    '--runInBand',
    '--no-cache',
    `--cacheDirectory=${path.join(root, 'plain-cache')}`,
    '--watchman=false',
  ]
}

/**
 * Lists the tests of a dry run in a form that is easy to compare.
 *
 * @param dry - Result of a dry run.
 * @returns For each test its file, name, line, attempts in one try, whether it
 *   failed, and its covers.
 */
function listTests(dry: DryRunResult): unknown[][] {
  return dry.tests.map(test => [
    path.basename(test.file),
    test.name,
    test.line,
    test.tries.length,
    test.tries[0]!.failed,
    test.tries[0]!.covers,
  ])
}

/**
 * Builds a dry-run request.
 *
 * @param fields - Fields that differ.
 * @returns Request of an instrumented dry run of what may load `related`.
 */
function createRequest(fields: Partial<DryRunRequest>): DryRunRequest {
  return {
    timeouts: { file: 60_000, test: 60_000 },
    instrumented: true,
    repeat: false,
    files: null,
    related: [],
    ...fields,
  }
}

/**
 * Summarizes a verdict for comparison across runs.
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

/**
 * Clears what must not reach a fixture's Jest: pnpm's shims put
 * `.pnpm/node_modules` in `NODE_PATH`, where `testEnvironment: node` on Jest 30
 * would resolve to the environment of Jest 29.
 */
function clearVariables(): void {
  for (let name of Object.keys(process.env)) {
    if (/^(?:NODE_OPTIONS$|NODE_PATH$|TEST$|VITEST)/u.test(name)) {
      vi.stubEnv(name, undefined)
    }
  }
}

/**
 * Copies a fixture for the current test.
 *
 * @param name - Directory of the fixture.
 * @param major - Major version of Jest the copy gets.
 * @returns Root of the copy.
 */
async function createProject(
  name: string,
  major: 29 | 30 = 30,
): Promise<string> {
  let root = await createJestProject(name, major)
  directories.push(root)
  return root
}

/**
 * Finds the verdict of the mutant with the given replacement.
 *
 * @param result - Result of a run.
 * @param replacement - Text the mutant puts in place of the code.
 * @returns Its verdict.
 */
function findReplaced(
  result: RunResult,
  replacement: string,
): MutantResult | undefined {
  return result.results.find(entry => entry.mutant.replacement === replacement)
}

/**
 * Changes a file and waits past the millisecond of the change.
 *
 * @param file - Absolute path of the file.
 * @param text - What to append, or the whole text with `replace`.
 * @param replace - Whether the text replaces what the file holds.
 */
async function changeFile(
  file: string,
  text: string,
  replace = false,
): Promise<void> {
  await (replace ? writeFile : appendFile)(file, text)
  await setTimeout(5)
}

/**
 * Finds the verdict of the mutant with the given description.
 *
 * @param results - Verdicts of a run.
 * @param mutant - Description by `describeMutant`.
 * @returns Its verdict.
 */
function findResult(
  results: MutantResult[],
  mutant: string,
): MutantResult | undefined {
  return results.find(result => describeMutant(result) === mutant)
}

/**
 * Lists the processes forked in the current test: the host, then the workers.
 *
 * @returns Their ids.
 */
function listForked(): number[] {
  return vi
    .mocked(fork)
    .mock.results.map(result => (result.value as ChildProcess).pid!)
}

/**
 * Copies the `cache` fixture for the current test and waits past the
 * millisecond of the copy, as a file modified in the millisecond a run starts
 * counts as changed during it.
 *
 * @returns Root of the copy.
 */
async function createCacheProject(): Promise<string> {
  let root = await createProject('cache')
  await setTimeout(5)
  return root
}

/**
 * Tells whether a process lives.
 *
 * @param pid - Its id.
 * @returns Whether a signal can reach it.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('jestAdapter', { timeout: 60_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it("creates an adapter with mootant's version and no batch mode", () => {
    expect(jestAdapter()).toMatchObject({ name: 'jest', batch: false, version })
  })

  it.each([
    { options: { command: 'jest --maxWorkers=2' }, workers: 2 },
    { options: undefined, workers: 3 },
  ])(
    'starts a session with the options $options',
    async ({ workers, options }) => {
      let root = await createProject('start')
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      let session = await jestAdapter(options).start({
        concurrency: null,
        workDirectory,
        files: [],
        root,
      })

      expect(session.workers).toBe(workers)
      expect(session.version).toMatch(/^30\./u)

      await session.close()
    },
  )
})

describe('jest adapter', { timeout: 180_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('runs dry runs of a real project on two warm workers, each with its own id', async () => {
    let root = await createProject('dry')
    let { session, output, files, ends } = await start(root)
    let source = path.join(root, 'src/math.js')

    /**
     * Gives the path of a test file of the copy.
     *
     * @param name - File name in the `test` directory.
     * @returns Its absolute path.
     */
    function testFile(name: string): string {
      return path.join(root, 'test', name)
    }

    expect(session.version).toMatch(/^30\./u)
    expect(session.workers).toBe(2)
    expect(session.diagnostics).toStrictEqual([])
    await expect(session.listTestFiles()).resolves.toStrictEqual([
      path.join(root, 'global-setup.js'),
      testFile('dom.test.js'),
      testFile('environment.test.js'),
      testFile('math.test.js'),
      testFile('retry.test.js'),
      testFile('unrelated.test.js'),
    ])

    files.push({
      original: await readFile(source, 'utf8'),
      switched: SWITCHED,
      file: source,
    })
    let related = [source]
    let first = await session.dryRun(createRequest({ related }))

    expect(first.files.map(file => file.file)).toStrictEqual([
      testFile('dom.test.js'),
      testFile('math.test.js'),
      testFile('retry.test.js'),
    ])
    expect(
      first.files.map(file => [file.loadFailed, file.errors, file.covers]),
    ).toStrictEqual([
      [false, [], ['at-load']],
      [false, [], ['at-load']],
      [false, [], ['at-load']],
    ])
    expect(listTests(first)).toStrictEqual([
      ['dom.test.js', 'runs in jsdom', 7, 1, false, ['in-double']],
      ['math.test.js', 'adds', 3, 1, false, ['in-add']],
      ['math.test.js', 'inside a block > doubles', 9, 1, false, ['in-double']],
      ['retry.test.js', 'passes on retry', 7, 1, false, ['in-add']],
    ])
    expect(first).toMatchObject({
      served: [source],
      mismatched: [],
      outside: [],
      hung: [],
    })
    expect(ends.count).toBe(5)
    expect(
      output
        .filter(entry => entry.file === testFile('math.test.js'))
        .map(entry => entry.text)
        .join(''),
    ).toContain('logged by adds')
    expect(
      output
        .filter(entry => entry.file === testFile('unrelated.test.js'))
        .map(entry => entry.text)
        .join(''),
    ).toContain('fails and reads no source')

    let second = await session.dryRun(
      createRequest({ instrumented: false, related }),
    )

    expect(second.files.map(file => file.covers)).toStrictEqual([[], [], []])
    expect(second.tests.map(item => item.tries[0]!.covers)).toStrictEqual([
      [],
      [],
      [],
      [],
    ])
    expect(second.served).toStrictEqual([])

    let third = await session.dryRun(createRequest({ related }))

    expect(listTests(third)).toStrictEqual(listTests(first))
    expect(third.files.map(file => file.covers)).toStrictEqual([
      ['at-load'],
      ['at-load'],
      ['at-load'],
    ])
    expect(third.served).toStrictEqual([source])
    expect(listForked()).toHaveLength(3)

    let printed = output.length
    let names = ['environment.test.js', 'math.test.js']
    let given = await session.dryRun(
      createRequest({
        files: names.map(name => ({ file: testFile(name), project: '' })),
      }),
    )

    expect(given.files.map(file => file.file)).toStrictEqual(
      names.map(name => testFile(name)),
    )
    expect(listTests(given)).toContainEqual([
      'environment.test.js',
      'sees the worker id and what global setup set',
      1,
      1,
      false,
      [],
    ])

    /**
     * Reads the worker id each of the two test files printed.
     *
     * @returns The ids, sorted.
     */
    function readIds(): string[] {
      return names
        .flatMap(name =>
          output
            .slice(printed)
            .filter(entry => entry.file === testFile(name))
            .map(entry => entry.text)
            .join('')
            .match(/(?<=worker id )\d/u),
        )
        .filter(id => id !== null)
        .toSorted()
    }

    await expect.poll(readIds, { timeout: 10_000 }).toStrictEqual(['1', '2'])
    expect(listForked()).toHaveLength(3)
    expect(ends.count).toBe(13)
    await expect(
      session.dryRun(createRequest({ repeat: true })),
    ).rejects.toThrow(
      'The jest adapter runs each test once; it cannot try tests twice in a row.',
    )

    let closed = session.close()

    expect(session.close()).toBe(closed)
    await closed

    expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
  })

  it('rejects the running and the later dry runs when the host dies, and stops the worker', async () => {
    let root = await createProject('dry')
    let file = path.join(root, 'test/sleep.test.js')
    let marker = path.join(root, 'sleeping')
    await writeFile(
      file,
      `test('sleeps', () => {
        require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000)
      })`,
    )
    let { session } = await start(root)
    let request = createRequest({
      files: [{ project: '', file }],
      instrumented: false,
    })
    let running = session.dryRun(request)

    await expect.poll(() => existsSync(marker), { timeout: 60_000 }).toBe(true)

    let [host, worker] = listForked()
    process.kill(-host!, 'SIGKILL')
    let sentence =
      /^The Jest process that ran global setup was stopped by SIGKILL/u

    await expect(running).rejects.toThrow(sentence)
    await expect.poll(() => isAlive(worker!), { timeout: 10_000 }).toBe(false)
    await expect(session.dryRun(request)).rejects.toThrow(sentence)
  })

  it('stops on a test file that fails to load without mutants', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns('jest', jestAdapter()),
        cwd: await createProject('broken'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests fail without mutants; fix them first (1 test file):\n  test/parse.test.js: fails to load: Missing fixture data',
    )
  })

  it.each(
    majors.flatMap(major => [
      {
        prepare: (file: string) =>
          appendFile(file, '\nexports[`removed 1`] = `1`;\n'),
        name: 'holds one no test checks',
        test: 'size',
        major,
      },
      {
        prepare: (file: string) =>
          writeFile(
            file,
            '// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing\n',
          ),
        name: 'holds no entry',
        test: 'limit',
        major,
      },
    ]),
  )(
    'stops on a test file whose snapshot file $name, which fails plain Jest $major too, and leaves the file as it was',
    async ({ prepare, major, test }) => {
      let root = await createProject('cache', major)
      let snapshots = path.join(root, `test/__snapshots__/${test}.test.js.snap`)
      await prepare(snapshots)
      let text = await readFile(snapshots, 'utf8')

      await expect(
        runMutants({
          builtIns: createBuiltIns('jest', jestAdapter()),
          paths: ['src'],
          concurrency: 1,
          cache: false,
          cwd: root,
        }),
      ).rejects.toThrow(
        `Tests fail without mutants; fix them first (1 test file):\n  test/${test}.test.js: fails to load: Snapshots are obsolete or failed while every test passed, which fails a plain run of Jest too.\nSnapshots may be missing or obsolete: mootant never writes or removes them, so update them with the test runner first.`,
      )
      await expect(readFile(snapshots, 'utf8')).resolves.toBe(text)

      let plain = await runReference(root, [], {
        args: createReferenceArguments(root),
        node: process.execPath,
        testFiles: () => [],
        timeout: 20_000,
      })

      expect(plain.original).toBe(false)
    },
  )

  it.each(majors)(
    'gives workers the configuration the host ran global setup with, which may differ from one reading to the next, as plain Jest %i does',
    async major => {
      let root = await createProject('cache', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          "testEnvironment: 'node',",
          () =>
            "testEnvironment: 'node',\n  globalSetup: '<rootDir>/global-setup.js',\n  globals: {\n    shared: require('node:fs').mkdtempSync(require('node:path').join(__dirname, 'shared-')),\n  },",
        ),
      )
      await writeFile(
        path.join(root, 'global-setup.js'),
        "let { writeFileSync } = require('node:fs')\nlet path = require('node:path')\n\nmodule.exports = (globalConfig, projectConfig) => {\n  writeFileSync(path.join(projectConfig.globals.shared, 'ready'), 'yes')\n}\n",
      )
      await writeFile(
        path.join(root, 'test/shared.test.js'),
        "let { readFileSync } = require('node:fs')\nlet path = require('node:path')\n\nlet { double } = require('../src/size')\n\ntest('reads what global setup wrote', () => {\n  expect(double(2)).toBe(4)\n  expect(readFileSync(path.join(shared, 'ready'), 'utf8')).toBe('yes')\n})\n",
      )

      let result = await runMutants({
        builtIns: createBuiltIns('jest', jestAdapter()),
        paths: ['src'],
        concurrency: 1,
        cache: false,
        cwd: root,
      })
      let plain = await runReference(root, [], {
        args: createReferenceArguments(root),
        node: process.execPath,
        testFiles: () => [],
        timeout: 20_000,
      })

      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(plain.original).toBe(true)
    },
  )

  it('stops when a setup file fails every test file without mutants', async () => {
    let root = await createProject('broken')
    await writeFile(
      path.join(root, 'setup.js'),
      `throw new Error('The setup broke')`,
    )
    await writeFile(
      path.join(root, 'jest.config.js'),
      `module.exports = {
        setupFiles: ['<rootDir>/setup.js'],
        testEnvironment: 'node',
      }`,
    )

    await expect(
      runMutants({
        builtIns: createBuiltIns('jest', jestAdapter()),
        paths: ['src'],
        concurrency: 1,
        cache: false,
        cwd: root,
      }),
    ).rejects.toThrow(
      'Tests fail without mutants; fix them first (1 test file):\n  test/parse.test.js: fails to load: The setup broke',
    )
  })

  it('stops on a test that hangs without mutants and names it', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns(
          'jest',
          shortenDryRuns(jestAdapter(), { file: 3000, test: 500 }),
        ),
        cwd: await createProject('stuck'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "waits forever" in test/wait.test.js',
    )
  })
})

describe.each(majors)('jest verdict equivalence on Jest %i', major => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('agrees with mutants applied by hand', { timeout: 600_000 }, async () => {
    let root = await createProject('basic', major)
    let { original, result, rows } = await runBothWays(root)
    let compared = rows.filter(row => !OWN_TIMEOUT.includes(row.mutant))
    let late = rows.find(row => row.mutant === LATE_REJECTION)!

    expect(original).toBe(true)
    expect(new Set(rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'Timeout', 'killed']),
    )
    expect(compared).toStrictEqual(
      compared.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(rows.filter(row => OWN_TIMEOUT.includes(row.mutant))).toStrictEqual(
      OWN_TIMEOUT.map(mutant => ({
        reference: 'killed',
        verdict: 'Timeout',
        mutant,
      })),
    )
    expect(
      pick(result.results, [
        // The setup file of the project reached it.
        "src/after-env.js | string-literal | ''",
        // No test is left, which plain Jest fails in its own words.
        'src/cases.js | boolean-literal | false',
        // `beforeAll` throws, which fails the test after it.
        'src/connect.js | comparison-operator | true',
        // A later test sees what the mutant left, never reaching it.
        'src/counter.js | assignment-operator | count -= 1',
        LATE_REJECTION,
        // `test.failing` passes when the test still fails, and fails when it
        // no longer does.
        'src/even.js | comparison-operator | value % 2 <= 0',
        'src/even.js | comparison-operator | value % 2 >= 0',
        // The process ends in the test, twice, the second time on a new worker.
        'src/guard.js | condition | true',
        // Loaded by `jest.isolateModules`.
        'src/isolated.js | arithmetic-operator | left + right',
        // Fake timers run the work a millisecond early.
        'src/later.js | arithmetic-operator | delay - 1',
        // The root `afterEach` fails, which fails the test.
        'src/ledger.js | assignment-operator | balance -= amount',
        // A constant, reached as the file loads.
        'src/limits.js | arithmetic-operator | 2 / 5',
        // Loaded through `moduleNameMapper`.
        'src/mapped.js | arithmetic-operator | left / right',
        // A plain survivor, a plain kill, and a function no test calls.
        'src/math.js | comparison-operator | value >= 0',
        'src/math.js | arithmetic-operator | left',
        'src/math.js | arithmetic-operator | value / 2',
        // `jest.mock` keeps the real function and replaces the other.
        'src/mocked.js | comparison-operator | value >= 0',
        'src/mocked.js | number-literal | 8',
        // A test inside two blocks.
        'src/nested.js | unary-operator | value',
        // No test reaches it in a unit, where a failed first attempt is no
        // reason to doubt a test that passes on retry.
        'src/once.js | boolean-literal | false',
        // Concurrent tests, one that kills and one that survives.
        'src/parallel.js | arithmetic-operator | value / value',
        'src/parallel.js | comparison-operator | value > 0',
        // The parent is what kills, as the child it forks runs the original.
        'src/parent.js | method-call | text',
        // The test loops without reaching a site, so only the watchdog stops it.
        'src/pause.js | boolean-literal | true',
        // `beforeAll` throws above nothing but a `test.todo`, which plain Jest
        // forgives.
        'src/planned.js | condition | true',
        // `afterAll` throws, which fails the file and no test.
        'src/release.js | condition | true',
        // A committed and an inline snapshot fail, as `--ci` writes neither.
        "src/render.js | string-literal | ''",
        // Loaded again after `jest.resetModules`.
        'src/renewed.js | update-operator | --count',
        // A test the failing test never comes near decides, and the failure of
        // that test's first attempt counts for nothing.
        'src/retried.js | comparison-operator | value <= 9',
        // That test reaches it and passes on retry, or fails on retry too.
        'src/retried.js | comparison-operator | value >= 1',
        'src/retried.js | comparison-operator | value > 2',
        // A test that fails each of its attempts.
        'src/retried.js | arithmetic-operator | value * 2',
        // The module throws while it loads.
        'src/schema.js | comparison-operator | true',
        // Loads a JSON file beside it.
        'src/settings.js | arithmetic-operator | value',
        // A loop through a site that never yields.
        'src/settle.js | missing-await | pending.promise',
        // No test fails, and a snapshot goes unchecked, which fails plain Jest.
        'src/shots.js | boolean-literal | false',
        // `test.skip` and `test.todo` decide nothing, and leave what they would
        // have reached not covered.
        'src/shelved.js | arithmetic-operator | value / 2',
        'src/shelved.js | arithmetic-operator | value / 3',
        // The test counts `fs.writeSync` calls, and the reach adds none.
        'src/spied.js | comparison-operator | text.length >= 1',
        'src/spied.js | comparison-operator | text.length != 1',
        // Writes fail as the mutant is reached, and the reach arrives later,
        // with no error in the test.
        'src/unwritten.js | comparison-operator | value >= 1',
        'src/unwritten.js | comparison-operator | value > 2',
        ...OWN_TIMEOUT,
      ]),
    ).toStrictEqual([
      "src/after-env.js | string-literal | '' | Killed | assertion | static",
      'src/cases.js | boolean-literal | false | Killed | hook-error | static',
      'src/connect.js | comparison-operator | true | Killed | assertion | static',
      'src/counter.js | assignment-operator | count -= 1 | Killed | assertion | -',
      // A rejection handled later in `beforeAll` passes where plain Jest forgives
      // it, as Jest 30 does, and fails the file outside any test where it does
      // not, as Jest 29.7 does; plain Jest on the major decides.
      late.reference === 'killed' ?
        `${LATE_REJECTION} | Killed | hook-error | static`
      : `${LATE_REJECTION} | Survived | - | static`,
      'src/even.js | comparison-operator | value % 2 <= 0 | Survived | - | -',
      'src/even.js | comparison-operator | value % 2 >= 0 | Killed | assertion | -',
      'src/guard.js | condition | true | Killed | crash | -',
      'src/isolated.js | arithmetic-operator | left + right | Killed | assertion | -',
      'src/later.js | arithmetic-operator | delay - 1 | Killed | assertion | -',
      'src/ledger.js | assignment-operator | balance -= amount | Killed | assertion | -',
      'src/limits.js | arithmetic-operator | 2 / 5 | Killed | assertion | static',
      'src/mapped.js | arithmetic-operator | left / right | Killed | assertion | -',
      'src/math.js | comparison-operator | value >= 0 | Survived | - | -',
      'src/math.js | arithmetic-operator | left | Killed | assertion | -',
      'src/math.js | arithmetic-operator | value / 2 | NoCoverage | - | -',
      'src/mocked.js | comparison-operator | value >= 0 | Killed | assertion | -',
      'src/mocked.js | number-literal | 8 | NoCoverage | - | -',
      'src/nested.js | unary-operator | value | Killed | assertion | -',
      'src/once.js | boolean-literal | false | NoCoverage | - | -',
      'src/parallel.js | arithmetic-operator | value / value | Killed | assertion | -',
      'src/parallel.js | comparison-operator | value > 0 | Survived | - | -',
      'src/parent.js | method-call | text | Killed | assertion | -',
      'src/pause.js | boolean-literal | true | Timeout | hang | static',
      'src/planned.js | condition | true | Survived | - | static',
      'src/release.js | condition | true | Killed | hook-error | static',
      "src/render.js | string-literal | '' | Killed | assertion | -",
      "src/render.js | string-literal | '' | Killed | assertion | -",
      'src/renewed.js | update-operator | --count | Killed | assertion | -',
      'src/retried.js | comparison-operator | value <= 9 | Survived | - | -',
      'src/retried.js | comparison-operator | value >= 1 | Survived | - | -',
      'src/retried.js | comparison-operator | value > 2 | Killed | assertion | -',
      'src/retried.js | arithmetic-operator | value * 2 | Killed | assertion | -',
      'src/schema.js | comparison-operator | true | Killed | load-error | static',
      'src/settings.js | arithmetic-operator | value | Killed | assertion | -',
      'src/settle.js | missing-await | pending.promise | Timeout | hit-limit | -',
      'src/shelved.js | arithmetic-operator | value / 2 | Killed | assertion | -',
      'src/shelved.js | arithmetic-operator | value / 3 | NoCoverage | - | -',
      'src/shots.js | boolean-literal | false | Killed | hook-error | -',
      'src/spied.js | comparison-operator | text.length >= 1 | Killed | assertion | -',
      'src/spied.js | comparison-operator | text.length != 1 | Survived | - | -',
      'src/unwritten.js | comparison-operator | value >= 1 | Survived | - | -',
      'src/unwritten.js | comparison-operator | value > 2 | Killed | assertion | -',
      'src/waiter.js | condition | false | Timeout | time-limit | -',
    ])
    expect(
      findResult(result.results, 'src/cases.js | boolean-literal | false')
        ?.message,
    ).toBe('Your test suite must contain at least one test.')
    let nested = findResult(
      result.results,
      'src/nested.js | unary-operator | value',
    )

    expect(nested?.coveredBy).toStrictEqual([nested?.killedBy])
    expect(
      result.results.filter(entry => entry.status === 'Error'),
    ).toStrictEqual([])
    expect(new Set(result.diagnostics.map(item => item.code))).toStrictEqual(
      new Set(['worker-hang']),
    )
    expect(result.diagnostics.map(item => item.file)).toContain(
      'test/pause.test.js',
    )

    // The entries of `shots` are out of Jest's order, and the header is not the
    // one of 29.7, so a run that writes such a file changes it.
    let snapshots = path.join(root, 'test/__snapshots__')
    let committed = path.resolve(
      import.meta.dirname,
      '../../fixtures/jest/basic/test/__snapshots__',
    )
    let names = ['render.test.js.snap', 'shots.test.js.snap']

    expect((await readdir(snapshots)).toSorted()).toStrictEqual(names)
    await expect(
      Promise.all(
        names.map(name => readFile(path.join(snapshots, name), 'utf8')),
      ),
    ).resolves.toStrictEqual(
      await Promise.all(
        names.map(name => readFile(path.join(committed, name), 'utf8')),
      ),
    )
    expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
  })

  it(
    'agrees with mutants applied by hand in ES modules',
    { timeout: 600_000 },
    async () => {
      let { original, result, rows } = await runBothWays(
        await createProject('esm', major),
        { nodeFlags: ['--experimental-vm-modules'] },
      )

      expect(original).toBe(true)
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(result.diagnostics).toStrictEqual([])
      expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
    },
  )

  it.skipIf(major !== 30)(
    'strips the types of a file no transformer claims, as plain Jest does',
    { timeout: 300_000 },
    async () => {
      let { original, result, rows } = await runBothWays(
        await createProject('transforms', major),
        TYPED,
      )

      expect(original).toBe(true)
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
      expect(result.diagnostics).toStrictEqual([])
    },
  )

  it.skipIf(major !== 29)(
    'fails a file no transformer claims that has types, as plain Jest does',
    { timeout: 300_000 },
    async () => {
      let root = await createProject('transforms', major)

      await expect(runBothWays(root, TYPED)).rejects.toThrow(
        /^Tests fail without mutants; fix them first \(1 test file\):\n {2}typed\/area\.test\.ts: fails to load: /u,
      )

      let plain = await runReference(root, [], {
        args: [...createReferenceArguments(root), ...TYPED.jestFlags],
        testFiles: TYPED.testFiles,
        node: process.execPath,
        timeout: 20_000,
      })

      expect(plain.original).toBe(false)
    },
  )

  it(
    'agrees with mutants applied by hand where the test environment gives a test an error as the run finishes',
    { timeout: 600_000 },
    async () => {
      let root = await createProject('cache', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          "testEnvironment: 'node'",
          "testEnvironment: '<rootDir>/environment.js'",
        ),
      )
      await writeFile(
        path.join(root, 'environment.js'),
        `let { TestEnvironment } = require('jest-environment-jsdom')

module.exports = class extends TestEnvironment {
  async handleTestEvent(event, state) {
    if (event.name === 'run_finish' && this.global.released !== true) {
      for (let test of state.rootDescribeBlock.children) {
        test.errors.push(new Error('the test kept what it held'))
      }
    }
  }
}
`,
      )
      await writeFile(
        path.join(root, 'src/release.js'),
        'exports.release = resource => {\n  resource.held = false\n  globalThis.released = true\n  return resource\n}\n',
      )
      await writeFile(
        path.join(root, 'test/release.test.js'),
        "let { release } = require('../src/release')\n\ntest('releases', () => {\n  expect(release({ held: true }).held).toBe(false)\n})\n",
      )
      let { original, result, rows } = await runBothWays(root, {
        paths: ['src/release.js'],
      })

      expect(original).toBe(true)
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(rows.filter(row => row.mutant.endsWith(' | false'))).toStrictEqual(
        [expect.objectContaining({ reference: 'killed', verdict: 'killed' })],
      )
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
    },
  )
})

describe('jest workers', { timeout: 300_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('never runs a test file twice at once', async () => {
    // Every unit of the test file uses one fixed file and a lock, so two units
    // that ran at once would fail or lose their verdicts.
    let { original, result, rows } = await runBothWays(
      await createProject('shared'),
    )

    expect(original).toBe(true)
    expect(result.diagnostics).toStrictEqual([])
    expect(
      result.results.filter(entry => entry.status === 'Error'),
    ).toStrictEqual([])
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'killed']),
    )
    expect(listForked().length).toBeLessThan(
      vi.mocked(runOnWorker).mock.calls.length,
    )
  })
})

describe.each(majors)('jest warm safety on Jest %i', major => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  /**
   * Verdicts by hand of the `leftovers` fixture, once the first test made them.
   */
  let reference: Awaited<ReturnType<typeof runReference>> | undefined

  it.each([{ concurrency: 1 }, { concurrency: 2 }])(
    'keeps what a test leaves from every later verdict, with concurrency $concurrency',
    { timeout: 600_000 },
    async ({ concurrency }) => {
      let run = await runBothWays(await createProject('leftovers', major), {
        ...(reference && { reference }),
        concurrency,
      })
      reference ??= run.reference

      checkLeftovers(run)
    },
  )

  it(
    'gives the same verdicts with fresh workers, on a fork per unit',
    { timeout: 600_000 },
    async () => {
      let run = await runBothWays(await createProject('leftovers', major), {
        adapter: jestAdapter({ freshWorkers: true }),
        ...(reference && { reference }),
      })
      reference ??= run.reference

      checkLeftovers(run)
      expect(vi.mocked(fork).mock.calls).toHaveLength(
        1 + vi.mocked(runOnWorker).mock.calls.length,
      )
    },
  )

  it.each([
    {
      paths: [
        'src/unref-a-plain.js',
        'src/unref-b-plain.js',
        'src/unref-c-plain.js',
        'src/unref-leaves.js',
      ],
      name: 'a server no guard sees, left by a kill',
    },
    {
      paths: ['src/hold-finds.js', 'src/hold-leaves.js'],
      name: 'a server left on the other slot',
    },
    {
      paths: ['src/warm-a-plain.js', 'src/warm-leaves.js'],
      name: 'a test that fails on a warm process',
    },
    {
      name: 'a change no guard sees, which a later mutant passes on',
      paths: ['src/web-agent-leaves.js'],
    },
  ])(
    'reads as plain Jest does with $name',
    { timeout: 300_000 },
    async ({ paths }) => {
      let { original, result, rows } = await runBothWays(
        await createProject('leftovers', major),
        { paths },
      )

      expect(original).toBe(true)
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )

  it.each([
    {
      title: 'creates a user once',
      test: 'test/users.test.js',
      paths: ['src/users.js'],
      name: 'its first kill',
    },
    {
      name: 'a kill after its first',
      test: 'test/orders.test.js',
      title: 'creates an order',
      paths: ['src/orders.js'],
    },
    {
      paths: ['src/a-quiet.js', 'src/z-slots.js'],
      title: 'creates an order of its worker',
      name: 'a kill, in a store per worker',
      test: 'test/z-slots.test.js',
    },
  ])(
    'stops a run whose test file cannot run again against one global setup, after $name',
    { timeout: 180_000 },
    async ({ paths, title, test }) => {
      let root = await createProject('global', major)
      let output: string[] = []
      let sentence = new RegExp(
        String.raw`^${test.replaceAll('.', String.raw`\.`)} fails when it runs again without mutants: .+; mootant runs a test file many times in one session, against one global setup, so its tests must not be flaky and must reset what they depend on before they run\. A mutant may also have changed or deleted files its tests depend on, such as build output; restore them and keep the code that did it out of runs with an ignore comment\.$`,
        'su',
      )

      await expect(
        runMutants({
          onProgress: event => {
            if (event.kind === 'output' && event.file === test) {
              output.push(event.text)
            }
          },
          builtIns: createBuiltIns('jest', jestAdapter()),
          concurrency: 2,
          cache: false,
          cwd: root,
          paths,
        }),
      ).rejects.toThrow(sentence)
      expect(output.join('')).toContain(title)
      expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
      expect(existsSync(path.join(root, 'store-closed'))).toBe(true)

      let plain = await runReference(root, [], {
        args: createReferenceArguments(root),
        node: process.execPath,
        testFiles: () => [],
        timeout: 20_000,
      })

      expect(plain.original).toBe(true)
    },
  )

  it(
    'runs a project on open handles serially, as plain Jest does, with no word',
    { timeout: 180_000 },
    async () => {
      // The test files share one fixed port, and fail when they overlap.
      let { original, result, rows } = await runBothWays(
        await createProject('open-handles', major),
        { concurrency: null },
      )

      expect(original).toBe(true)
      expect(result.diagnostics).toStrictEqual([])
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )

  it(
    'keeps its heap limit from what a test forks or starts as a thread',
    { timeout: 180_000 },
    async () => {
      let root = await createProject('heap', major)
      let { session } = await start(root)
      let dry = await session.dryRun(
        createRequest({
          files: [
            { file: path.join(root, 'test/limits.test.js'), project: '' },
          ],
          instrumented: false,
        }),
      )
      let limits = JSON.parse(
        await readFile(path.join(root, 'limits.json'), 'utf8'),
      ) as {
        forked: { flags: string[]; limit: number }
        variable: string | null
        flags: string[]
        thread: number
        own: number
      }

      expect(dry.files).toMatchObject([{ loadFailed: false, errors: [] }])
      expect(limits).toMatchObject({
        forked: { flags: [] },
        variable: null,
        flags: [],
      })
      expect(limits.forked.limit).toBeGreaterThan(limits.own)
      expect(limits.thread).toBeGreaterThan(limits.own)
    },
  )

  it(
    'gives a global setup the concurrency, in place of the workers of the test script',
    { timeout: 300_000 },
    async () => {
      let { original, result, rows } = await runBothWays(
        await createProject('per-worker', major),
      )

      expect(original).toBe(true)
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
  )
})

describe('jest adapter at the edges', { timeout: 180_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('stops when a transformer rejects the text with mutants, with the first line of its error', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns('jest', jestAdapter()),
        cwd: await createProject('transforms'),
        paths: ['rejected/half.js'],
        concurrency: 2,
        cache: false,
      }),
    ).rejects.toThrow(
      new Error(
        "The test runner's transformer rejects the text with mutants of rejected/half.js: This transformer refuses globalThis; exclude the file.",
      ),
    )
    expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
  })

  it('runs a test file of two projects as two units whose test ids hold the project, and skips a custom runner with a word', async () => {
    let root = await createProject('projects')
    let { session } = await start(root)
    let file = path.join(root, 'test/title.test.js')
    let dry = await session.dryRun(
      createRequest({ related: [path.join(root, 'src/title.js')] }),
    )
    let name = 'names the page where there is one'

    expect(session.diagnostics).toStrictEqual([
      {
        message:
          "mootant runs only Jest's own runner with jest-circus, so it skips the Jest project lint.",
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])
    expect(
      dry.files
        .toSorted((left, right) => left.project.localeCompare(right.project))
        .map(entry => [entry.project, entry.file]),
    ).toStrictEqual([
      ['browser', file],
      ['server', file],
    ])
    expect(
      dry.tests
        .toSorted((left, right) => left.project.localeCompare(right.project))
        .map(test => [test.project, test.id]),
    ).toStrictEqual(
      ['browser', 'server'].map(project => [
        project,
        getTestId(root, file, { occurrence: 0, project, name }),
      ]),
    )
    let ids = new Set(dry.tests.map(test => test.id))

    expect(ids.size).toBe(2)
    expect(
      vi
        .mocked(runOnWorker)
        .mock.calls.filter(([, , input]) => input.unit.file === file)
        .map(([, , input]) => input.unit.console),
    ).toStrictEqual(['buffer', 'buffer'])
  })

  it('runs the three dry runs of the core when the switched text breaks a test, and drops that file alone', async () => {
    let again: string[] = []
    let result = await runMutants({
      onProgress: event => {
        if (event.kind === 'dry-again') {
          again.push(event.message)
        }
      },
      cwd: await createProject('instrumentation-break'),
      builtIns: createBuiltIns('jest', jestAdapter()),
      paths: ['src'],
      concurrency: 2,
      cache: false,
    })
    let broken =
      'Tests fail with the switched src/render.js and pass without it; its mutants are not run.'

    expect(result.runs.dry).toBe(3)
    expect(again).toStrictEqual([
      'Some tests failed; running them again without mutants to check.',
      'Running the dry run again without 1 file that broke tests.',
    ])
    expect(result.diagnostics).toStrictEqual([
      {
        code: 'instrumentation-break',
        file: 'src/render.js',
        severity: 'error',
        message: broken,
        column: null,
        line: null,
      },
    ])
    expect(
      new Set(
        result.results.map(entry =>
          [
            entry.mutant.file,
            entry.status,
            entry.status === 'Error' ? entry.message : '-',
          ].join(' | '),
        ),
      ),
    ).toStrictEqual(
      new Set([
        `src/render.js | Error | ${broken}`,
        'src/math.js | Survived | -',
        'src/math.js | Killed | -',
      ]),
    )
  })

  it("hands on what a console kept with the results of a file, as Jest's reporters show it", async () => {
    let root = await createProject('logging')
    let { session, output } = await start(root)
    let file = path.join(root, 'test/count.test.js')
    let dry = await session.dryRun(
      createRequest({ files: [{ project: 'quiet', file }] }),
    )

    expect(dry.tests).toMatchObject([{ tries: [{ failed: false }] }])
    expect(
      output.filter(entry => entry.file === file).map(entry => entry.text),
    ).toStrictEqual([
      '  ● Console\n\n    console.log\n      counting 3\n\n      at log (src/count.js:2:11)\n\n',
    ])
  })

  it('shows what a test printed before it hung, as its recheck writes it at once', async () => {
    let output: string[] = []

    await expect(
      runMutants({
        builtIns: createBuiltIns(
          'jest',
          shortenDryRuns(jestAdapter({ env: { LOGGING_HANG: '1' } }), {
            file: 3000,
            test: 500,
          }),
        ),
        onProgress: event => {
          if (event.kind === 'output' && event.file === 'test/hang.test.js') {
            output.push(event.text)
          }
        },
        cwd: await createProject('logging'),
        paths: ['src/count.js'],
        concurrency: 2,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "logs, then waits for a lock when asked" in test/hang.test.js',
    )
    expect(output.join('').match(/waiting for the lock/gu)).toHaveLength(1)
  })

  it.each(['jest', 'jest --passWithNoTests'])(
    'stops a project with no test file in one sentence, with the command %s',
    async command => {
      let root = await createProject('empty')

      await expect(
        runMutants({
          builtIns: createBuiltIns('jest', jestAdapter({ command })),
          paths: ['src'],
          concurrency: 2,
          cache: false,
          cwd: root,
        }),
      ).rejects.toThrow(
        new Error(
          `Jest found no test files in ${root}; add a test or fix the Jest configuration.`,
        ),
      )
      expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
    },
  )

  it('warns that the type check of ts-jest is off, by the path of the transformer, when it is the first one of a test file', async () => {
    let root = await createProject('instrumentation-break')
    await mkdir(path.join(root, 'fake/ts-jest'), { recursive: true })
    await writeFile(
      path.join(root, 'fake/ts-jest/index.js'),
      'module.exports = { process: code => ({ code }) }',
    )
    await writeFile(
      path.join(root, 'fake/plain.js'),
      'module.exports = { process: code => ({ code }) }',
    )
    await writeFile(
      path.join(root, 'jest.config.js'),
      String.raw`module.exports = {
        transform: { '\\.js$': '<rootDir>/fake/ts-jest/index.js' },
        testEnvironment: 'node',
      }`,
    )
    let { session } = await start(root)
    await session.close()

    expect(session.diagnostics).toStrictEqual([
      {
        message:
          "ts-jest's type check is off under mootant, so a test file's own type error passes, and a type error alone does not kill a mutant.",
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])

    await writeFile(
      path.join(root, 'jest.config.js'),
      String.raw`module.exports = {
        transform: {
          '\\.[jt]s$': '<rootDir>/fake/plain.js',
          '\\.js$': '<rootDir>/fake/ts-jest/index.js',
        },
        testEnvironment: 'node',
      }`,
    )
    let shadowed = await start(root)

    expect(shadowed.session.diagnostics).toStrictEqual([])
  })
})

describe('jest verdict equivalence at the edges', { timeout: 600_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it.each([
    [
      'its test_done',
      "if (event.name === 'test_done') {\n      release(event.test)\n    }",
    ],
    [
      'run_finish',
      "if (event.name === 'run_finish') {\n      state.rootDescribeBlock.children.forEach(release)\n    }",
    ],
  ])(
    'agrees with mutants applied by hand where a test environment takes the errors of a test in quarantine on %s',
    async (_name, handler) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          "testEnvironment: 'node'",
          () => "testEnvironment: '<rootDir>/quarantine.js'",
        ),
      )
      await writeFile(
        path.join(root, 'quarantine.js'),
        `let { TestEnvironment } = require('jest-environment-jsdom')

function release(test) {
  if (test.name.includes('quarantined')) {
    test.errors = []
  }
}

module.exports = class extends TestEnvironment {
  handleTestEvent(event, state) {
    ${handler}
  }
}
`,
      )
      await writeFile(
        path.join(root, 'src/gate.js'),
        'exports.open = value => value > 0\n',
      )
      await writeFile(
        path.join(root, 'test/gate.test.js'),
        "let { open } = require('../src/gate')\n\ntest('opens for a positive value', () => {\n  expect(open(1)).toBe(true)\n})\n\ntest('stays shut at zero, quarantined', () => {\n  expect(open(0)).toBe(false)\n})\n",
      )
      let { original, result, rows } = await runBothWays(root, {
        paths: ['src/gate.js'],
      })

      expect(original).toBe(true)
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
      expect(
        result.results.filter(entry => entry.status === 'Error'),
      ).toStrictEqual([])
    },
  )

  it('agrees with mutants applied by hand through transformers, but for a file kept out of the transform', async () => {
    let { original, result, rows } = await runBothWays(
      await createProject('transforms'),
      { nodeFlags: ['--experimental-vm-modules'] },
    )
    let keptOut = rows.filter(row =>
      KEPT_OUT.has(row.mutant.split(' | ', 1)[0]!),
    )
    let compared = rows.filter(row => !keptOut.includes(row))

    expect(original).toBe(true)
    expect(compared).toStrictEqual(
      compared.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(compared.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'killed']),
    )
    expect(keptOut.map(row => row.verdict)).toStrictEqual(
      keptOut.map(() => 'survived'),
    )
    expect(keptOut.map(row => row.reference)).toContain('killed')
    expect(
      result.results.filter(entry => entry.status === 'Error'),
    ).toStrictEqual([])
    expect(result.diagnostics).toStrictEqual([
      {
        message:
          "No test loaded src/generated/words.js through the test runner's transform: the Jest configuration's transformIgnorePatterns keeps it out of the transform.",
        file: 'src/generated/words.js',
        code: 'never-served',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
    expect(listForked().filter(pid => isAlive(pid))).toStrictEqual([])
  })

  it('agrees with mutants applied by hand in several projects, where a test file of both runs as a unit of each', async () => {
    let root = await createProject('projects')
    let { original, result, rows } = await runBothWays(root, {
      testFiles: file => PROJECT_TESTS[file]!,
    })
    let title = path.join(root, 'test/title.test.js')
    let projects = new Set(
      vi
        .mocked(runOnWorker)
        .mock.calls.filter(
          ([, , input]) =>
            input.unit.mutant !== null && input.unit.file === title,
        )
        .map(([, , input]) => input.unit.project),
    )

    expect(original).toBe(true)
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'killed']),
    )
    expect(
      result.results.filter(entry => entry.status === 'Error'),
    ).toStrictEqual([])
    expect(projects.size).toBe(2)
  })

  it('agrees with mutants applied by hand where tests read their console, as the whole suite runs', async () => {
    let { original, result, rows } = await runBothWays(
      await createProject('logging'),
      { testFiles: () => LOGGING_TESTS },
    )

    expect(original).toBe(true)
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'killed']),
    )
    expect(
      result.results.filter(entry => entry.mutant.file === 'src/greet.js'),
    ).toContainEqual(expect.objectContaining({ status: 'Survived' }))
    expect(
      result.results.filter(entry => entry.status === 'Error'),
    ).toStrictEqual([])
  })
})

describe('jest adapter with the cache', { timeout: 300_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('reuses every verdict of an unchanged project and runs no unit', async () => {
    let root = await createCacheProject()
    let first = await runCached(root)
    let second = await runCached(root)

    expect(first.result.cache).toBe(true)
    expect(first.result.diagnostics).toStrictEqual([])
    expect(first.result.results.some(entry => entry.cached)).toBe(false)
    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      first.result.results.map(summarizeCachedVerdict),
    )
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: [],
    })
    expect(second.result.runs).toStrictEqual({ dry: 1 })
    expect(second.units).toBe(0)
  })

  it.each<[string, string, (root: string) => Promise<void>]>([
    [
      'probes a missing file',
      "existsSync(path.join(__dirname, 'src.ts'))",
      () => Promise.resolve(),
    ],
    [
      'reads a file',
      "readFileSync(path.join(__dirname, 'shared.json'))",
      root => writeFile(path.join(root, 'shared.json'), '{}\n'),
    ],
  ])(
    'reuses every verdict of an unchanged project whose transformer %s only while the disk cache of Jest lacks the module',
    async (_name, read, prepare) => {
      let root = await createCacheProject()
      let transformer = path.join(root, 'transform.js')
      await prepare(root)
      await writeFile(
        transformer,
        (await readFile(transformer, 'utf8'))
          .replace(
            "let { readFileSync } = require('node:fs')",
            "let { existsSync, readFileSync } = require('node:fs')",
          )
          .replace(
            '    readOptions()\n    return { code }',
            `    readOptions()\n    ${read}\n    return { code }`,
          ),
      )
      await setTimeout(5)
      await runCached(root)
      let second = await runCached(root)

      expect(splitCached(second.result)).toStrictEqual({
        cached: ['src/limit.js', 'src/size.js'],
        ran: [],
      })
      expect(second.units).toBe(0)
    },
  )

  it('runs the mutants of a changed source again, and the units of the test files that load it', async () => {
    let root = await createCacheProject()
    await runCached(root)
    await changeFile(path.join(root, 'src/limit.js'), '\nexports.unused = 1\n')
    let { result } = await runCached(root)
    let size = result.results.filter(
      entry => entry.mutant.file === 'src/size.js',
    )
    let survivors = size.filter(entry => entry.status === 'Survived')
    let kills = size.filter(
      entry => entry.killedIn?.endsWith('size.test.js') === true,
    )

    expect(
      result.results
        .filter(entry => entry.mutant.file === 'src/limit.js')
        .some(entry => entry.cached),
    ).toBe(false)
    expect(survivors.length).toBeGreaterThan(0)
    expect(kills.length).toBeGreaterThan(0)
    // Their other test file loads the changed file, so only that unit runs.
    expect(survivors.every(entry => !entry.cached && entry.tries === 1)).toBe(
      true,
    )
    expect(kills.every(entry => entry.cached)).toBe(true)
  })

  it('runs only the units of a changed test file again', async () => {
    let root = await createCacheProject()
    let first = await runCached(root)
    await changeFile(path.join(root, 'test/limit.test.js'), '// changed\n')
    let second = await runCached(root)
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
    expect(findReplaced(second.result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: true,
      tries: 0,
    })
    expect(second.units).toBeLessThan(first.units)
  })

  it('runs the units of a test file again when its snapshot changes', async () => {
    let root = await createCacheProject()
    await runCached(root)
    await changeFile(
      path.join(root, 'test/__snapshots__/size.test.js.snap'),
      '// changed\n',
    )
    let { result } = await runCached(root)

    expect(findReplaced(result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: false,
    })
    expect(findReplaced(result, 'Math.max(value, 100)')).toMatchObject({
      status: 'Killed',
      cached: true,
    })
  })

  it('runs every mutant again when the Jest configuration, a setup file, the transformer or a Babel configuration changes', async () => {
    let root = await createCacheProject()
    await runCached(root)
    let all = ['src/limit.js', 'src/size.js']
    let changes: [string, string, boolean][] = [
      ['jest.config.js', '// changed\n', false],
      ['test/setup.js', '// changed\n', false],
      ['transform.js', '// changed\n', false],
      ['babel.config.js', 'module.exports = {}\n', true],
    ]
    await changes.reduce(async (previous, [file, text, replace]) => {
      await previous
      await changeFile(path.join(root, file), text, replace)
      let { result } = await runCached(root)

      expect({ ...splitCached(result), file }).toStrictEqual({
        cached: [],
        ran: all,
        file,
      })
    }, Promise.resolve())
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({ cached: all, ran: [] })
  })

  it('runs every mutant again when a file the transformer reads once in a worker changes, which a later unit of the worker never reads', async () => {
    let root = await createCacheProject()
    await runCached(root, { concurrency: 1 })
    await changeFile(
      path.join(root, 'transform.json'),
      '{ "kept": false }\n',
      true,
    )
    let { result } = await runCached(root, { concurrency: 1 })

    expect(splitCached(result)).toStrictEqual({
      ran: ['src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it.each<[string, (file: string) => Promise<void>]>([
    ['changes', file => writeFile(file, '0\n')],
    ['appears', () => Promise.resolve()],
  ])(
    'runs every mutant again when a file the transformer looks for in a module only mutants load %s, which a later unit of the worker never reads',
    async (_name, prepare) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'transform: {',
          () => String.raw`transform: { 'extra\\.js$': '<rootDir>/inline.js',`,
        ),
      )
      await writeFile(
        path.join(root, 'inline.js'),
        `let { createHash } = require('node:crypto')
let { existsSync, readFileSync } = require('node:fs')
let path = require('node:path')

function readValue(file) {
  let found = path.join(path.dirname(file), 'extra.json')
  return existsSync(found) ? readFileSync(found, 'utf8') : '0'
}

module.exports = {
  getCacheKey(code, file) {
    return createHash('sha1').update(code).update(readValue(file)).digest('hex')
  },
  process(code, file) {
    return { code: code.replace('VALUE', readValue(file).trim()) }
  },
}
`,
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(
        path.join(root, 'lib/extra.js'),
        'module.exports = VALUE\n',
      )
      await prepare(path.join(root, 'lib/extra.json'))
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.first = flag => (flag ? require('../lib/extra') : 0)\n\nexports.second = flag => (flag ? require('../lib/extra') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { first, second } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(first(false) + second(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)

      /**
       * Lists the verdicts of the mutants that load the module.
       *
       * @param result - Result of a run.
       * @returns Status of each and whether it came from the cache.
       */
      function readForced(result: RunResult): [string, boolean][] {
        return result.results
          .filter(
            entry => describeMutant(entry) === 'src/pick.js | condition | true',
          )
          .map(entry => [entry.status, entry.cached])
      }

      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'lib/extra.json'), '1\n', true)
      let { result } = await runCached(root, { concurrency: 1 })

      expect(readForced(first.result)).toStrictEqual([
        ['Survived', false],
        ['Survived', false],
      ])
      expect(readForced(result)).toStrictEqual([
        ['Killed', false],
        ['Killed', false],
      ])
      expect(splitCached(result)).toStrictEqual({
        ran: ['src/limit.js', 'src/pick.js', 'src/size.js'],
        cached: [],
      })
    },
  )

  it.each<[string, string]>([
    [
      'in each call',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) => {
  if (request !== '@fallback') {
    return options.defaultResolver(request, options)
  }
  let routes = JSON.parse(
    readFileSync(path.join(__dirname, 'routing.json'), 'utf8'),
  )
  return path.join(options.rootDir, routes.fallback)
}
`,
    ],
    [
      'as it loads',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')

let routes = JSON.parse(
  readFileSync(path.join(__dirname, 'routing.json'), 'utf8'),
)

module.exports = (request, options) =>
  request === '@fallback' ?
    path.join(options.rootDir, routes.fallback)
  : options.defaultResolver(request, options)
`,
    ],
  ])(
    'runs a mutant again when a file the resolver of the project reads %s changes, by which it resolves a module only that mutant loads',
    async (_name, resolver) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(path.join(root, 'resolver.js'), resolver)
      await writeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/one.js" }\n',
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.js'), 'module.exports = 1\n')
      await writeFile(path.join(root, 'lib/zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('@fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/zero.js" }\n',
        true,
      )
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
      expect(third.units).toBe(0)
    },
  )

  it.each(majors)(
    'runs a mutant again when a file appears that the resolver of the project looks for to choose a module only that mutant loads, past what Jest %i resolves for it',
    async major => {
      let root = await createProject('cache', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { existsSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) => {
  if (request !== '@fallback') {
    return options.defaultResolver(request, options)
  }
  let chosen = existsSync(path.join(options.rootDir, 'use-new.flag'))
  return path.join(options.rootDir, chosen ? 'lib/zero.js' : 'lib/one.js')
}
`,
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.js'), 'module.exports = 1\n')
      await writeFile(path.join(root, 'lib/zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('@fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'use-new.flag'), '', true)
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
      expect(third.units).toBe(0)
    },
  )

  it.skipIf(!majors.includes(29))(
    'runs a mutant again when a file appears that a packageFilter of the resolver of the project looks for, which Jest 29 calls inside its default resolver',
    async () => {
      let root = await createProject('cache', 29)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'setupFiles:',
          () => "resolver: '<rootDir>/resolver.js',\n  setupFiles:",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { existsSync } = require('node:fs')
let path = require('node:path')

module.exports = (request, options) =>
  options.defaultResolver(request, {
    ...options,
    packageFilter: manifest => {
      if (manifest.name !== 'fallback') {
        return manifest
      }
      let chosen = existsSync(path.join(options.rootDir, 'use-new.flag'))
      return { ...manifest, main: chosen ? 'zero.js' : 'one.js' }
    },
  })
`,
      )
      let fallback = path.join(root, 'node_modules/fallback')
      await mkdir(fallback)
      await writeFile(
        path.join(fallback, 'package.json'),
        '{ "name": "fallback" }\n',
      )
      await writeFile(path.join(fallback, 'one.js'), 'module.exports = 1\n')
      await writeFile(path.join(fallback, 'zero.js'), 'module.exports = 0\n')
      await writeFile(
        path.join(root, 'src/pick.js'),
        "exports.pick = flag => (flag ? require('fallback') : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.js'),
        "let { pick } = require('../src/pick')\n\ntest('falls back', () => {\n  expect(pick(false)).toBe(0)\n})\n",
      )
      await setTimeout(5)
      let forced = 'src/pick.js | condition | true'
      let first = await runCached(root, { concurrency: 1 })
      await changeFile(path.join(root, 'use-new.flag'), '', true)
      let second = await runCached(root, { concurrency: 1 })

      expect(findResult(first.result.results, forced)).toMatchObject({
        status: 'Killed',
        cached: false,
      })
      expect(findResult(second.result.results, forced)).toMatchObject({
        status: 'Survived',
        cached: false,
      })
    },
  )

  it.each(majors)(
    'runs again every mutant that loads a module an asynchronous resolver of the project chose by a file it read after an await, when that file changes, on Jest %i',
    async major => {
      let root = await createProject('esm', major)
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          'transform: {},',
          () => "transform: {},\n  resolver: '<rootDir>/resolver.js',",
        ),
      )
      await writeFile(
        path.join(root, 'resolver.js'),
        `let { readFileSync } = require('node:fs')
let path = require('node:path')

module.exports = {
  async: async (request, options) => {
    if (request !== '@fallback') {
      return options.defaultResolver(request, options)
    }
    await new Promise(resolve => {
      setTimeout(resolve, 1)
    })
    let routes = JSON.parse(
      readFileSync(path.join(options.rootDir, 'routing.json'), 'utf8'),
    )
    return path.join(options.rootDir, routes.fallback)
  },
  sync: (request, options) => options.defaultResolver(request, options),
}
`,
      )
      await writeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/one.mjs" }\n',
      )
      await mkdir(path.join(root, 'lib'))
      await writeFile(path.join(root, 'lib/one.mjs'), 'export default 1\n')
      await writeFile(path.join(root, 'lib/zero.mjs'), 'export default 0\n')
      await writeFile(
        path.join(root, 'src/pick.mjs'),
        "export let first = async flag => (flag ? (await import('@fallback')).default : 0)\n\nexport let second = async flag => (flag ? (await import('@fallback')).default : 0)\n",
      )
      await writeFile(
        path.join(root, 'test/pick.test.mjs'),
        "import { first, second } from '../src/pick.mjs'\n\ntest('falls back', async () => {\n  expect((await first(false)) + (await second(false))).toBe(0)\n})\n",
      )
      await setTimeout(5)

      /**
       * Lists the verdicts of the mutants that load the module.
       *
       * @param result - Result of a run.
       * @returns Status of each and whether it came from the cache.
       */
      function readForced(result: RunResult): [string, boolean][] {
        return result.results
          .filter(
            entry =>
              describeMutant(entry) === 'src/pick.mjs | condition | true',
          )
          .map(entry => [entry.status, entry.cached])
      }

      let first = await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'routing.json'),
        '{ "fallback": "lib/zero.mjs" }\n',
        true,
      )
      let second = await runCached(root, { concurrency: 1 })
      let third = await runCached(root, { concurrency: 1 })

      expect(readForced(first.result)).toStrictEqual([
        ['Killed', false],
        ['Killed', false],
      ])
      expect(readForced(second.result)).toStrictEqual([
        ['Survived', false],
        ['Survived', false],
      ])
      expect(third.units).toBe(0)
    },
  )

  it.each<[string, string]>([
    [
      'as it loads',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy = readFileSync(path.join(__dirname, 'policy.json'), 'utf8')

module.exports = class extends TestEnvironment {
  constructor(config, context) {
    super(config, context)
    this.global.policy = JSON.parse(policy)
  }
}
`,
    ],
    [
      'in its setup, once in a worker',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy

module.exports = class extends TestEnvironment {
  async setup() {
    await super.setup()
    policy ??= readFileSync(path.join(__dirname, 'policy.json'), 'utf8')
    this.global.policy = JSON.parse(policy)
  }
}
`,
    ],
    [
      'in its event handler, once in a worker',
      `let { readFileSync } = require('node:fs')
let path = require('node:path')
let { TestEnvironment } = require('jest-environment-jsdom')

let policy

module.exports = class extends TestEnvironment {
  async handleTestEvent(event) {
    if (event.name === 'test_start') {
      policy ??= readFileSync(path.join(__dirname, 'policy.json'), 'utf8')
      this.global.policy = JSON.parse(policy)
    }
  }
}
`,
    ],
  ])(
    'runs every mutant again when a file the test environment reads %s changes, which a later unit of the worker never reads',
    async (_name, environment) => {
      let root = await createCacheProject()
      let config = path.join(root, 'jest.config.js')
      await writeFile(
        config,
        (await readFile(config, 'utf8')).replace(
          "testEnvironment: 'node'",
          "testEnvironment: '<rootDir>/environment.js'",
        ),
      )
      await writeFile(path.join(root, 'policy.json'), '{ "strict": false }\n')
      await writeFile(
        path.join(root, 'src/half.js'),
        'exports.half = value => value / 2\n',
      )
      await writeFile(
        path.join(root, 'test/half.test.js'),
        "let { half } = require('../src/half')\n\ntest('halves', () => {\n  expect(half(4)).toBe(2)\n})\n",
      )
      await writeFile(path.join(root, 'environment.js'), environment)
      await setTimeout(5)
      await runCached(root, { concurrency: 1 })
      await changeFile(
        path.join(root, 'policy.json'),
        '{ "strict": true }\n',
        true,
      )
      let { result } = await runCached(root, { concurrency: 1 })

      expect(splitCached(result)).toStrictEqual({
        ran: ['src/half.js', 'src/limit.js', 'src/size.js'],
        cached: [],
      })
    },
  )

  it('keeps what a setup file queued with the reads of the test file, under a test environment of the project', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node'",
        "testEnvironment: '<rootDir>/environment.js'",
      ),
    )
    await writeFile(
      path.join(root, 'environment.js'),
      "let { TestEnvironment } = require('jest-environment-jsdom')\n\nmodule.exports = class extends TestEnvironment {}\n",
    )
    await writeFile(
      path.join(root, 'test/setup.js'),
      "globalThis.setUp = true\n\nvoid Promise.resolve().then(() => require('../src/clock'))\n",
    )
    await writeFile(
      path.join(root, 'src/clock.js'),
      'exports.tick = value => value + 1\n',
    )
    await writeFile(
      path.join(root, 'test/clock.test.js'),
      "let { tick } = require('../src/clock')\n\ntest('ticks', () => {\n  expect(tick(1)).toBe(2)\n})\n",
    )
    await setTimeout(5)
    let { result } = await runCached(root, { cache: false })

    expect(
      result.results
        .filter(entry => entry.mutant.file === 'src/clock.js')
        .map(entry => entry.status),
    ).not.toContain('NoCoverage')
  })

  it('runs the mutants of a test file again when a variable changes that a child process it started got from the worker', async () => {
    let root = await createCacheProject()
    await writeFile(
      path.join(root, 'src/half.js'),
      'exports.half = value => value / 2\n',
    )
    await writeFile(
      path.join(root, 'test/half.test.js'),
      "let { execFileSync } = require('node:child_process')\nlet { half } = require('../src/half')\n\ntest('halves, with a child', () => {\n  execFileSync(process.execPath, ['-e', '0'])\n  expect(half(4)).toBe(2)\n})\n",
    )
    await setTimeout(5)
    await runCached(root)
    vi.stubEnv('CHILD_PROBE', '1')
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: ['src/half.js'],
    })
  })

  it('runs every mutant again when a variable changes, once a preload made a promisified execFile that tests start children with, which no wrapper sees', async () => {
    let root = await createCacheProject()
    let preload = path.join(root, 'preload.cjs')
    await writeFile(
      preload,
      "let { execFile } = require('node:child_process')\nlet { promisify } = require('node:util')\n\nglobalThis.execFileAsync = promisify(execFile)\n",
    )
    await writeFile(
      path.join(root, 'src/half.js'),
      'exports.half = value => value / 2\n',
    )
    await writeFile(
      path.join(root, 'test/half.test.js'),
      "let { half } = require('../src/half')\n\ntest('halves, with a child', async () => {\n  await execFileAsync(process.execPath, ['-e', '0'])\n  expect(half(4)).toBe(2)\n})\n",
    )
    vi.stubEnv('NODE_OPTIONS', `--require ${preload}`)
    await setTimeout(5)
    await runCached(root)
    vi.stubEnv('CHILD_PROBE', '1')
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      ran: ['src/half.js', 'src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it('runs the mutants of a file again when what it reads through a URL of the test environment changes', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node'",
        "testEnvironment: 'jsdom'",
      ),
    )
    await writeFile(path.join(root, 'src/gate.json'), '1\n')
    await writeFile(
      path.join(root, 'src/gate.js'),
      "let { readFileSync } = require('node:fs')\n\nexports.open = () =>\n  Number(readFileSync(new URL('file://' + __dirname + '/gate.json'), 'utf8')) >= 0\n",
    )
    await writeFile(
      path.join(root, 'test/gate.test.js'),
      "let { open } = require('../src/gate')\n\ntest('opens', () => {\n  expect(open()).toBe(true)\n})\n",
    )
    await setTimeout(5)
    await runCached(root)
    await changeFile(path.join(root, 'src/gate.json'), '0\n', true)
    let { result } = await runCached(root)

    expect(splitCached(result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: ['src/gate.js'],
    })
  })

  it('gives a test file the same dependencies whichever file ran before it on its worker, on Jest 29 too, whose resolver reads what it probes', async () => {
    let root = await createProject('cache', 29)
    let files = ['test/limit.test.js', 'test/size.test.js'].map(file => ({
      file: path.join(root, file),
      project: '',
    }))

    /**
     * Starts a session with one worker and runs one dry run of the files in the
     * given order.
     *
     * @param order - Test files in the order they run.
     * @returns The dependencies of each test file, sorted by the file.
     */
    async function readDependencies(
      order: typeof files,
    ): Promise<[string, undefined | string[] | null][]> {
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      let session = await jestAdapter().start({
        concurrency: 1,
        workDirectory,
        files: [],
        root,
      })
      closes.push(session.close)
      let dry = await session.dryRun(createRequest({ files: order }))
      return dry.files.map(entry => [entry.file, entry.dependencies])
    }

    let first = await readDependencies(files)
    let second = await readDependencies(files.toReversed())

    expect(second).toStrictEqual(first)
    expect(first.map(([file]) => file)).toStrictEqual(
      files.map(({ file }) => file),
    )
  })

  it('runs the units of the test file that reads a changed variable again, nothing for one no test reads, and everything for a verdict variable', async () => {
    let root = await createCacheProject()
    vi.stubEnv('CACHE_UNREAD', 'a')
    vi.stubEnv('CACHE_READ', 'a')
    vi.stubEnv('TZ', 'Europe/Berlin')
    let first = await runCached(root)
    let unchanged = await runCached(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result).ran).toStrictEqual([])

    vi.stubEnv('CACHE_UNREAD', 'b')
    let unread = await runCached(root)

    expect(splitCached(unread.result).ran).toStrictEqual([])

    vi.stubEnv('CACHE_READ', 'b')
    let read = await runCached(root)

    expect(
      read.result.results
        .filter(entry => entry.mutant.file === 'src/limit.js')
        .every(entry => !entry.cached),
    ).toBe(true)
    expect(findReplaced(read.result, 'value / 2')).toMatchObject({
      status: 'Killed',
      cached: true,
    })
    expect(read.units).toBeGreaterThan(0)
    expect(read.units).toBeLessThan(first.units)

    vi.stubEnv('TZ', 'Asia/Tokyo')
    let zone = await runCached(root)

    expect(splitCached(zone.result)).toStrictEqual({
      ran: ['src/limit.js', 'src/size.js'],
      cached: [],
    })
  })

  it('runs the mutants again when the configuration the host ran with changes, though what --showConfig gave stays', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "testEnvironment: 'node',",
        () =>
          "testEnvironment: 'node',\n  globals: {\n    CHECK_RESULTS:\n      !process.argv.includes('--showConfig') &&\n      process.env.STRICT_ASSERTIONS === '1',\n  },",
      ),
    )
    await writeFile(
      path.join(root, 'src/triple.js'),
      'exports.triple = value => value * 3\n',
    )
    await writeFile(
      path.join(root, 'test/triple.test.js'),
      "let { triple } = require('../src/triple')\n\ntest('triples, checked when the run asks', () => {\n  let result = triple(2)\n  if (CHECK_RESULTS) {\n    expect(result).toBe(6)\n  }\n})\n",
    )
    await setTimeout(5)
    let mutant = 'src/triple.js | arithmetic-operator | value / 3'
    let first = await runCached(root)
    vi.stubEnv('STRICT_ASSERTIONS', '1')
    let second = await runCached(root)

    expect(findResult(first.result.results, mutant)).toMatchObject({
      status: 'Survived',
    })
    expect(findResult(second.result.results, mutant)).toMatchObject({
      status: 'Killed',
      cached: false,
    })
  })

  it('keeps the transforms of an unchanged project in the cache of Jest from one session to the next, for a transformer that keys them by the configuration', async () => {
    let root = await createCacheProject()
    let config = path.join(root, 'jest.config.js')
    let log = path.join(root, 'processed.log')
    await writeFile(
      config,
      (await readFile(config, 'utf8')).replace(
        "'<rootDir>/transform.js'",
        () => "'<rootDir>/count.js'",
      ),
    )
    await writeFile(
      path.join(root, 'count.js'),
      "let { appendFileSync } = require('node:fs')\nlet path = require('node:path')\n\nmodule.exports = {\n  process(code, file) {\n    appendFileSync(path.join(__dirname, 'processed.log'), path.basename(file) + '\\n')\n    return { code }\n  },\n}\n",
    )
    await setTimeout(5)
    await runCached(root, { cache: false })
    let first = await readFile(log, 'utf8')
    await runCached(root, { cache: false })

    expect(first).not.toBe('')
    await expect(readFile(log, 'utf8')).resolves.toBe(first)
  })

  it('keeps the cache of a test that writes back a file it reads', async () => {
    let root = await createCacheProject()
    let file = path.join(root, 'test/state.json')
    let before = await stat(file)
    let text = await readFile(file, 'utf8')
    await runCached(root)
    let after = await stat(file)
    let second = await runCached(root)

    expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs)
    await expect(readFile(file, 'utf8')).resolves.toBe(text)
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/limit.js', 'src/size.js'],
      ran: [],
    })
    expect(second.units).toBe(0)
  })

  it('neither reads nor writes the cache when it is off', async () => {
    let root = await createCacheProject()
    let file = getCachePath(root)
    await runCached(root)
    let saved = await readFile(file, 'utf8')
    let { result } = await runCached(root, { cache: false })

    expect(result.cache).toBe(false)
    expect(result.results.some(entry => entry.cached)).toBe(false)
    await expect(readFile(file, 'utf8')).resolves.toBe(saved)
  })

  it('keeps what differs from one session to another out of the cache inputs and the dependencies', async () => {
    let root = await createCacheProject()
    let files = ['test/limit.test.js', 'test/size.test.js'].map(file => ({
      file: path.join(root, file),
      project: '',
    }))

    /**
     * Starts a session, runs one dry run and reads its cache inputs, as the
     * core does.
     *
     * @returns The settings, files and dependencies of each test file.
     */
    async function readSession(): Promise<unknown[]> {
      let { session } = await start(root)
      let dry = await session.dryRun(createRequest({ files }))
      let inputs = await session.cacheInputs!()
      await session.close()
      return [
        inputs.settings,
        inputs.files,
        dry.files.map(entry => entry.dependencies),
      ]
    }

    let first = await readSession()
    let second = await readSession()

    expect(second).toStrictEqual(first)
    expect(JSON.stringify(first)).not.toContain('mootant-work-')
    expect(first[1]).toContain(path.join(root, 'transform.json'))
    expect(first[2]).toStrictEqual([
      expect.arrayContaining([
        path.join(root, 'src/limit.js'),
        path.join(root, 'test/state.json'),
        path.join(root, 'test/__snapshots__/limit.test.js.snap'),
      ]),
      expect.arrayContaining([
        path.join(root, 'test/__snapshots__/size.test.js.snap'),
        path.join(root, 'package.json'),
      ]),
    ])
  })
})
