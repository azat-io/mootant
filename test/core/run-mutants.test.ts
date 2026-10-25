import {
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  writeFile,
  readFile,
  realpath,
  mkdtemp,
  mkdir,
  stat,
  rm,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { FakeWorld } from '../helpers/create-fake-adapter'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { RunConfig } from '../../types/config/run-config'
import type { RunEvent } from '../../types/run/run-event'

import { createSwitchedFiles } from '../../core/instrument/create-switched-files'
import { readChangedLines } from '../../core/git/read-changed-lines'
import { createFakeAdapter } from '../helpers/create-fake-adapter'
import { getCachePath } from '../../core/cache/get-cache-path'
import { loadConfig } from '../../core/config/load-config'
import { listMutants } from '../../core/list-mutants'
import { runMutants } from '../../core/run-mutants'

vi.mock(import('../../core/config/load-config'), () => ({
  loadConfig: vi.fn(),
}))

vi.mock(import('../../core/git/read-changed-lines'), () => ({
  readChangedLines: vi.fn(),
}))

vi.mock(
  import('../../core/instrument/create-switched-files'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createSwitchedFiles: vi.fn(actual.createSwitchedFiles) }
  },
)

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Ids of the pending mutants of each source file, by display path.
 */
let ids: Record<string, string[]> = {}

/**
 * Runs the mutants of the project with a fake adapter, without a configuration
 * file unless the test set one.
 *
 * @param world - Simulated tests of the project.
 * @param options - Options of the run that differ from the defaults: the `src`
 *   paths and the fake adapter as the only built-in, detected.
 * @returns Result of the run and the fake adapter.
 */
async function run(
  world: FakeWorld,
  options: Partial<Parameters<typeof runMutants>[0]> = {},
): Promise<{
  result: Awaited<ReturnType<typeof runMutants>>
  fake: ReturnType<typeof createFakeAdapter>
}> {
  let fake = createFakeAdapter(world)
  if (vi.mocked(loadConfig).getMockImplementation() === undefined) {
    vi.mocked(loadConfig).mockResolvedValue(null)
  }
  let result = await runMutants({
    builtIns: {
      fake: {
        load: () => Promise.resolve(fake.adapter),
        detect: () => Promise.resolve(true),
      },
    },
    paths: ['src'],
    cwd: root,
    ...options,
  })
  return { result, fake }
}

/**
 * Makes the project use a configuration file with the given run settings.
 *
 * @param settings - Run settings of the configuration.
 */
function useRunConfig(settings: RunConfig): void {
  vi.mocked(loadConfig).mockResolvedValue({
    file: path.join(root, 'mootant.config.js'),
    config: { run: settings },
    directory: root,
  })
}

describe('runMutants', () => {
  beforeAll(async () => {
    root = await realpath(
      await mkdtemp(path.join(tmpdir(), 'mootant-run-mutants-')),
    )
    await mkdir(path.join(root, 'src'))
    await writeFile(
      path.join(root, 'src/math.ts'),
      'export function add(a: number, b: number): number {\n  return a + b\n}\n',
    )
    await writeFile(
      path.join(root, 'src/flag.ts'),
      'export let ratio = 2 * 3\n// mootant-ignore-next-line: shown elsewhere\nexport let size = 4 - 1\n',
    )
    await writeFile(
      path.join(root, 'src/card.astro'),
      '---\nlet n = 1 + 2\n---\n',
    )
    await mkdir(path.join(root, 'ui'))
    await writeFile(path.join(root, 'ui/badge.svelte'), '<p>{1 + 2}</p>\n')
    await mkdir(path.join(root, 'view'))
    await writeFile(
      path.join(root, 'view/badge.vue'),
      '<template><p>{{ 1 + 2 }}</p></template>\n',
    )
    vi.mocked(loadConfig).mockResolvedValue(null)
    let listed = await listMutants({ paths: ['src'], cwd: root })
    ids = Object.fromEntries(
      listed.files.map(file => [
        file.file,
        file.mutants
          .filter(mutant => mutant.status === 'Pending')
          .map(mutant => mutant.id),
      ]),
    )
  })

  beforeEach(() => {
    vi.mocked(loadConfig).mockReset()
    vi.mocked(createSwitchedFiles).mockClear()
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('decides every covered mutant isolated by default', async () => {
    let [add] = ids['src/math.ts']!
    let [ratio, two, three] = ids['src/flag.ts']!
    let { result, fake } = await run({
      tests: [
        {
          freshKills: { [two!]: 'expected 6 to be 5' },
          file: path.join(root, 'test/math.test.ts'),
          kills: { [add!]: 'expected 3 to be -1' },
          covers: [add!, ratio!, two!],
          id: 'math',
        },
      ],
      files: [
        { file: path.join(root, 'test/math.test.ts'), loadCovers: [three!] },
      ],
    })

    expect(fake.calls.dry.map(request => request.repeat)).toStrictEqual([false])
    expect(fake.calls.batch).toStrictEqual([])
    expect(result).toMatchObject({
      runs: { isolated: 1, dry: 1 },
      mode: 'isolated',
    })
    expect(
      result.results.map(({ isolatedBecause, path: route, mutant, status }) => [
        mutant.id,
        status,
        route,
        isolatedBecause,
      ]),
    ).toStrictEqual([
      [ratio, 'Survived', 'isolated', null],
      [two, 'Killed', 'isolated', null],
      [three, 'Survived', 'isolated', 'static'],
      [expect.any(String), 'Ignored', null, null],
      [expect.any(String), 'Ignored', null, null],
      [expect.any(String), 'Ignored', null, null],
      [add, 'Killed', 'isolated', null],
    ])
    expect(result.timing.batch).toBeNull()
    expect(result.unrepeatable).toBeNull()
  })

  it('notes a tie between detected test runners', async () => {
    let [add] = ids['src/math.ts']!
    let fake = createFakeAdapter({
      tests: [
        {
          file: path.join(root, 'test/math.test.ts'),
          covers: [add!],
          id: 'math',
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(null)
    let events: RunEvent[] = []
    let detected = {
      load: () => Promise.resolve(fake.adapter),
      detect: () => Promise.resolve(true),
    }

    let result = await runMutants({
      builtIns: Object.fromEntries([
        ['fake', detected],
        ['other', detected],
      ]),
      onProgress: event => {
        events.push(event)
      },
      mutantIds: [add!],
      paths: ['src'],
      cwd: root,
    })

    expect(result.runner).toBe('fake')
    expect(events.filter(event => event.kind === 'note')).toStrictEqual([
      {
        message:
          'Found several test runners (fake, other) and used fake; set run.runner to choose another.',
        kind: 'note',
      },
    ])
  })

  it('runs the mutants of the paths in fast mode and decides them', async () => {
    let [add] = ids['src/math.ts']!
    let [ratio, two, three] = ids['src/flag.ts']!
    let { result, fake } = await run(
      {
        tests: [
          {
            freshKills: { [two!]: 'expected 6 to be 5' },
            file: path.join(root, 'test/math.test.ts'),
            kills: { [add!]: 'expected 3 to be -1' },
            covers: [add!, ratio!, two!],
            id: 'math',
          },
        ],
        files: [
          {
            file: path.join(root, 'test/math.test.ts'),
            loadCovers: [three!],
          },
        ],
      },
      { fast: true },
    )

    expect(fake.context).toMatchObject({ concurrency: null, root })
    expect(fake.context!.files.map(file => file.file)).toStrictEqual([
      path.join(root, 'src/flag.ts'),
      path.join(root, 'src/math.ts'),
    ])
    await expect(stat(fake.context!.workDirectory)).rejects.toThrow('ENOENT')
    expect(fake.closed).toBe(1)
    expect(result).toMatchObject({
      runs: { isolated: 1, batch: 1, dry: 1 },
      preset: 'recommended',
      threshold: null,
      runner: 'fake',
      mode: 'fast',
      root,
    })
    expect(result.files.map(file => file.file)).toStrictEqual([
      'src/flag.ts',
      'src/math.ts',
    ])
    expect(
      result.results.map(({ isolatedBecause, path: route, mutant, status }) => [
        mutant.id,
        status,
        route,
        isolatedBecause,
      ]),
    ).toStrictEqual([
      [ratio, 'Survived', 'isolated', 'batch-survivor'],
      [two, 'Killed', 'isolated', 'batch-survivor'],
      [three, 'Survived', 'isolated', 'static'],
      [expect.any(String), 'Ignored', null, null],
      [expect.any(String), 'Ignored', null, null],
      [expect.any(String), 'Ignored', null, null],
      [add, 'Killed', 'batch', null],
    ])
    expect(result.staticCost).toStrictEqual([
      { file: 'src/flag.ts', duration: 3, mutants: 1, units: 3 },
    ])
    expect(result.tests.map(test => test.id)).toStrictEqual(['math'])
    expect(result.diagnostics).toStrictEqual([
      {
        message:
          'src/card.astro is an Astro component; mootant run does not run Astro components yet.',
        code: 'unsupported-file',
        file: 'src/card.astro',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
    expect(result.timing.total).toBeGreaterThanOrEqual(result.timing.batch!)
    expect(result.unrepeatable).toStrictEqual([])
  })

  it('counts kills of a run decided on the batch path in its last verdicts', async () => {
    let added = ids['src/math.ts']!
    let events: RunEvent[] = []
    let { result, fake } = await run(
      {
        tests: [
          {
            kills: Object.fromEntries(added.map(id => [id, 'boom'])),
            file: path.join(root, 'test/math.test.ts'),
            covers: added,
            id: 'math',
          },
        ],
      },
      {
        onProgress: event => {
          events.push(event)
        },
        paths: ['src/math.ts'],
        fast: true,
      },
    )

    expect(result.runs).toStrictEqual({ batch: 1, dry: 1 })
    expect(fake.context!.onUnitEnd).toBeTypeOf('function')
    expect(events.findLast(event => event.kind === 'verdicts')).toStrictEqual({
      killed: added.length,
      kind: 'verdicts',
      survived: 0,
      timeout: 0,
      error: 0,
    })
  })

  it('counts nothing as units end without a receiver of progress', async () => {
    let { fake } = await run({ tests: [] }, { paths: ['src/math.ts'] })

    expect(fake.context!.onUnitEnd).toBeUndefined()
  })

  it('selects a mutant by a prefix of its id, reports the warnings of the session first and plans for its workers', async () => {
    let [add] = ids['src/math.ts']!
    let warning: Diagnostic = {
      message: 'pool "threads" changed to "forks".',
      code: 'config-overridden',
      severity: 'warning',
      column: null,
      file: null,
      line: null,
    }
    let { result, fake } = await run(
      {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            id: 'math',
          },
        ],
        diagnostics: [warning],
        version: '5.0.4',
        workers: 4,
      },
      { mutantIds: [add!.slice(0, 6)], concurrency: 2, fast: true },
    )

    expect(result.results.map(({ mutant }) => mutant.id)).toStrictEqual([add])
    expect(result.listedIds).toStrictEqual(
      expect.arrayContaining([add, ...ids['src/flag.ts']!]),
    )
    expect(result.runnerVersion).toBe('5.0.4')
    expect(result.diagnostics).toStrictEqual([warning])
    expect(fake.calls.batch[0]!.concurrency).toBe(4)
  })

  it('hosts the other pending mutants of the files of the selected mutants in the dry run', async () => {
    let [ratio, ...others] = ids['src/flag.ts']!
    let { result, fake } = await run(
      {
        tests: [
          {
            file: path.join(root, 'test/flag.test.ts'),
            covers: [ratio!, ...others],
            id: 'flag',
          },
        ],
      },
      { mutantIds: [ratio!] },
    )

    expect(result.results.map(({ mutant }) => mutant.id)).toStrictEqual([ratio])
    expect(
      vi
        .mocked(createSwitchedFiles)
        .mock.calls[0]![0].map(file => [
          file.file,
          file.mutants
            .filter(mutant => mutant.status === 'Pending')
            .map(mutant => mutant.id),
        ]),
    ).toStrictEqual([['src/flag.ts', ids['src/flag.ts']]])
    expect(fake.calls.isolated.flatMap(call => call.units)).toHaveLength(1)
  })

  it('takes paths relative to its directory, runner and settings from the configuration', async () => {
    let [add] = ids['src/math.ts']!
    let fake = createFakeAdapter({
      tests: [
        {
          file: path.join(root, 'test/math.test.ts'),
          covers: [add!],
          id: 'math',
        },
      ],
      testFiles: [path.join(root, 'src/flag.ts')],
      batch: false,
    })
    useRunConfig({
      paths: ['src/math.ts', 'src/flag.ts'],
      timeout: { constant: 10, factor: 1 },
      hitLimit: { factor: 2, floor: 5 },
      runner: fake.adapter,
      concurrency: 3,
      threshold: 50,
      fast: true,
    })

    let events: RunEvent[] = []
    let result = await runMutants({
      onProgress: event => {
        events.push(event)
      },
      cwd: path.join(root, 'src'),
      builtIns: {},
      paths: [],
    })

    expect(events.filter(event => event.kind === 'note')).toStrictEqual([
      {
        message:
          'fake has no batch mode, so fast mode runs every mutant isolated, as a run without --fast does.',
        kind: 'note',
      },
    ])
    expect(fake.calls.dry.map(request => request.repeat)).toStrictEqual([false])
    expect(fake.context!.concurrency).toBe(3)
    expect(fake.calls.isolated[0]!.units).toStrictEqual([
      {
        limits: { timeout: 10 + 11, hitLimit: 10 },
        file: path.join(root, 'test/math.test.ts'),
        mutant: add,
        project: '',
      },
    ])
    expect(result.threshold).toBe(50)
    expect(result.mode).toBe('isolated')
    expect(result.timing.batch).toBeNull()
    expect(result.unrepeatable).toBeNull()
    expect(result.results.map(entry => entry.isolatedBecause)).toStrictEqual([
      null,
    ])
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['test-file-excluded'],
    )
  })

  it('lets the options win over the configuration', async () => {
    let [add] = ids['src/math.ts']!
    useRunConfig({ concurrency: 5, threshold: 10, fast: true })
    let { result, fake } = await run(
      {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            id: 'math',
          },
        ],
      },
      { mutantIds: [add!], concurrency: 2, threshold: 80, fast: false },
    )

    expect(fake.context!.concurrency).toBe(2)
    expect(result.threshold).toBe(80)
    expect(result.mode).toBe('isolated')
    expect(result.files.map(file => file.file)).toStrictEqual(['src/math.ts'])
    expect(result.results).toMatchObject([
      { isolatedBecause: null, status: 'Survived', path: 'isolated' },
    ])
  })

  it('fails without paths and on unknown mutant ids', async () => {
    vi.mocked(loadConfig).mockResolvedValue(null)

    await expect(
      runMutants({ builtIns: {}, paths: [], cwd: root }),
    ).rejects.toThrow('mootant run needs paths, such as "mootant run src".')
    await expect(
      runMutants({
        mutantIds: ['zzzzzzzzzzzz'],
        paths: ['src'],
        builtIns: {},
        cwd: root,
      }),
    ).rejects.toThrow('Unknown mutant id "zzzzzzzzzzzz".')
  })

  it('runs only the mutants on lines changed since a revision', async () => {
    let [add] = ids['src/math.ts']!
    let [ratio] = ids['src/flag.ts']!
    vi.mocked(readChangedLines).mockResolvedValue({
      files: new Map([[path.join(root, 'src/math.ts'), new Set([2])]]),
      base: 'abc123',
    })
    let file = path.join(root, 'test/math.test.ts')
    let world: FakeWorld = {
      tests: [
        {
          kills: { [add!]: 'expected 3 to be -1' },
          covers: [add!, ratio!],
          id: 'math',
          file,
        },
      ],
      files: [{ file }],
    }

    let { result } = await run(world, { since: 'main' })

    expect(readChangedLines).toHaveBeenCalledExactlyOnceWith(root, 'main')
    expect(result.since).toStrictEqual({ base: 'abc123', ref: 'main' })
    expect(
      result.results.map(verdict => [verdict.mutant.id, verdict.status]),
    ).toStrictEqual([[add, 'Killed']])
    expect(result.files.map(listed => listed.file)).toStrictEqual([
      'src/math.ts',
    ])
    expect(result.listedIds).toContain(ratio)
    await expect(
      run(world, { mutantIds: [ratio!], since: 'main' }),
    ).rejects.toThrow(
      `Mutant "${ratio}" is not on a line changed since main; drop --since to run it.`,
    )
    let { result: pinned } = await run(world, {
      mutantIds: [add!],
      since: 'main',
    })
    expect(pinned.results.map(verdict => verdict.mutant.id)).toStrictEqual([
      add,
    ])
    await expect(
      run(world, { mutantIds: ['zzzzzzzzzzzz'], since: 'main' }),
    ).rejects.toThrow('Unknown mutant id "zzzzzzzzzzzz".')
  })

  it.each([
    { mode: 'isolated', fast: false },
    { mode: 'fast', fast: true },
  ] as const)(
    'does not start the test runner when no changed line has a mutant ($mode)',
    async ({ mode, fast }) => {
      vi.mocked(readChangedLines).mockResolvedValue({
        files: new Map([[path.join(root, 'src/flag.ts'), new Set([2])]]),
        base: 'abc123',
      })
      useRunConfig({ threshold: 50 })

      let { result, fake } = await run(
        { tests: [], files: [] },
        { since: 'main', fast },
      )

      expect(fake.context).toBeNull()
      expect(result).toMatchObject({
        timing: { batch: fast ? 0 : null, isolated: 0, dryRun: 0 },
        since: { base: 'abc123', ref: 'main' },
        unrepeatable: fast ? [] : null,
        runnerVersion: null,
        runner: 'fake',
        threshold: 50,
        cache: false,
        results: [],
        tests: [],
        runs: {},
        mode,
      })
      expect(
        result.files.map(listed => [listed.file, listed.mutants]),
      ).toStrictEqual([['src/flag.ts', []]])
      expect(result.listedIds).toStrictEqual(
        expect.arrayContaining(Object.values(ids).flat()),
      )
    },
  )

  it('reports unrepeatable tests before the batch phases', async () => {
    let [ratio, two] = ids['src/flag.ts']!
    let events: RunEvent[] = []
    let file = path.join(root, 'test/flag.test.ts')
    let { result } = await run(
      {
        tests: [
          { covers: [ratio!, two!], dry: 'flaky', id: 'flaky', file },
          { covers: [ratio!], id: 'steady', file },
        ],
        output: [
          { text: 'log\n', file },
          { text: 'warning\n', file: null },
        ],
      },
      {
        onProgress: event => {
          events.push(event)
        },
        paths: ['src/flag.ts'],
        concurrency: 2,
        fast: true,
      },
    )

    expect(
      events.map(event =>
        event.kind === 'dry-end' ? { ...event, duration: 0 } : event,
      ),
    ).toStrictEqual([
      { kind: 'mutants', ignored: 3, total: 6, files: 1 },
      { kind: 'dry-start', files: 1 },
      { file: 'test/flag.test.ts', kind: 'output', text: 'log\n' },
      { text: 'warning\n', kind: 'output', file: null },
      { kind: 'unit-end', duration: null, unit: null },
      { kind: 'dry-end', duration: 0, tests: 2 },
      {
        message:
          '1 test is not repeatable; the 2 mutants it reaches run isolated.',
        kind: 'note',
      },
      { kind: 'verdicts', survived: 0, timeout: 0, killed: 0, error: 0 },
      {
        kind: 'run-start',
        run: 'isolated',
        chains: [0, 0],
        costs: [2, 2],
        workers: 2,
        mutants: 2,
        round: 1,
        units: 2,
      },
      { kind: 'verdicts', survived: 1, timeout: 0, killed: 0, error: 0 },
      { kind: 'unit-end', duration: 2, unit: 0 },
      { kind: 'verdicts', survived: 2, timeout: 0, killed: 0, error: 0 },
      { kind: 'unit-end', duration: 2, unit: 1 },
    ])
    expect(result.unrepeatable).toStrictEqual(['flaky'])
    expect(result.diagnostics).toStrictEqual([
      {
        message:
          '"flaky" gave different results in two runs without mutants; the mutants it reaches run isolated.',
        code: 'unrepeatable-test',
        file: 'test/flag.test.ts',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
  })

  it('runs the mutants of a file that fails only when repeated isolated', async () => {
    let [ratio, two] = ids['src/flag.ts']!
    let file = path.join(root, 'test/flag.test.ts')
    let { result } = await run(
      {
        tests: [
          { covers: [ratio!], id: 'sets', file },
          { dry: 'repeated', covers: [two!], id: 'counts', file },
        ],
      },
      { paths: ['src/flag.ts'], fast: true },
    )

    expect(result.unrepeatable).toStrictEqual(['counts', 'sets'])
    expect(result.runs).toMatchObject({ dry: 2 })
    expect(
      result.diagnostics.map(diagnostic => diagnostic.message),
    ).toStrictEqual([
      '"sets" is in a test file that fails when each test runs twice and passes when each runs once; the mutants it reaches run isolated.',
      '"counts" is in a test file that fails when each test runs twice and passes when each runs once; the mutants it reaches run isolated.',
    ])
    expect(
      result.results
        .filter(({ mutant }) => [ratio, two].includes(mutant.id))
        .map(mutantResult => mutantResult.isolatedBecause),
    ).toStrictEqual(['unrepeatable', 'unrepeatable'])
  })

  it('warns in fast mode about test files with concurrent tests', async () => {
    let [ratio] = ids['src/flag.ts']!
    let file = path.join(root, 'test/flag.test.ts')
    let world = {
      tests: [{ covers: [ratio!], id: 'one', file }],
      files: [{ concurrent: true, file }],
    }
    let fast = await run(world, { paths: ['src/flag.ts'], fast: true })
    let isolated = await run(world, { paths: ['src/flag.ts'] })

    expect(fast.result.diagnostics).toStrictEqual([
      {
        message:
          'test/flag.test.ts has concurrent tests, which fast mode runs one at a time in the dry run and in batch runs; coverage and verdicts that depend on concurrency may be wrong, so run without --fast to keep them concurrent.',
        code: 'config-overridden',
        file: 'test/flag.test.ts',
        severity: 'warning',
        column: null,
        line: null,
      },
    ])
    expect(isolated.result.diagnostics).toStrictEqual([])
  })

  it('counts unrepeatable tests and their one mutant', async () => {
    let [ratio] = ids['src/flag.ts']!
    let notes: string[] = []
    let file = path.join(root, 'test/flag.test.ts')
    await run(
      {
        tests: [
          { covers: [ratio!], dry: 'flaky', id: 'one', file },
          { covers: [ratio!], dry: 'flaky', id: 'two', file },
        ],
      },
      {
        onProgress: event => {
          if (event.kind === 'note') {
            notes.push(event.message)
          }
        },
        paths: ['src/flag.ts'],
        fast: true,
      },
    )

    expect(notes).toContain(
      '2 tests are not repeatable; the 1 mutant they reach runs isolated.',
    )
  })

  it('gives the mutants of files that cannot be switched an error', async () => {
    vi.mocked(createSwitchedFiles).mockReturnValueOnce({
      diagnostics: [
        {
          message: 'Cannot host the mutants of src/math.ts.',
          code: 'instrument-error',
          file: 'src/math.ts',
          severity: 'error',
          column: null,
          line: null,
        },
      ],
      switched: [],
    })

    let { result, fake } = await run({ tests: [] }, { paths: ['src/math.ts'] })

    expect(fake.calls.dry).toStrictEqual([])
    expect(result.runs).toStrictEqual({})
    expect(result.results).toMatchObject([
      { message: 'Cannot host the mutants of src/math.ts.', status: 'Error' },
    ])
  })

  it('checks switched components with the compiler of their framework', async () => {
    await run({ tests: [] }, { paths: ['ui'] })
    await run({ tests: [] }, { paths: ['view'] })
    await run({ tests: [] }, { paths: ['src/math.ts'] })

    expect(
      vi
        .mocked(createSwitchedFiles)
        .mock.calls.map(([files, compilers]) => [
          files.map(file => file.file),
          typeof compilers?.svelte?.compile,
          typeof compilers?.vue?.compile,
        ]),
    ).toStrictEqual([
      [['ui/badge.svelte'], 'function', 'undefined'],
      [['view/badge.vue'], 'undefined', 'function'],
      [['src/math.ts'], 'undefined', 'undefined'],
    ])
  })

  it('gives the mutants of files loaded with another text an error', async () => {
    let [add] = ids['src/math.ts']!
    let { result } = await run(
      {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            id: 'math',
          },
        ],
        mismatched: [path.join(root, 'src/math.ts')],
      },
      { paths: ['src/math.ts'] },
    )

    expect(result.results).toMatchObject([{ status: 'Error', path: null }])
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      ['instrument-error'],
    )
  })

  it('removes the work directory when the adapter does not start', async () => {
    let workDirectory = ''
    useRunConfig({
      runner: {
        start: context => {
          ;({ workDirectory } = context)
          return Promise.reject(new Error('Vitest is missing.'))
        },
        name: 'broken',
        batch: true,
      },
    })

    await expect(
      runMutants({ paths: ['src'], builtIns: {}, cwd: root }),
    ).rejects.toThrow('Vitest is missing.')
    await expect(stat(workDirectory)).rejects.toThrow('ENOENT')
  })

  describe('with the cache', () => {
    /**
     * Builds a project whose test kills the mutant of `src/math.ts` and covers
     * two mutants of `src/flag.ts`, with an adapter that supports the cache.
     *
     * @param fields - Changes to the simulated project.
     * @returns Simulated project.
     */
    function createWorld(fields: Partial<FakeWorld> = {}): FakeWorld {
      let [add] = ids['src/math.ts']!
      let [ratio, two] = ids['src/flag.ts']!
      return {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            kills: { [add!]: 'expected 3 to be -1' },
            covers: [add!, ratio!, two!],
            id: 'math',
          },
        ],
        cacheInputs: { settings: null, files: [] },
        ...fields,
      }
    }

    /**
     * Finds the cache file of the project.
     *
     * @returns Absolute path of the cache file.
     */
    function cacheFile(): string {
      return getCachePath(root)
    }

    afterEach(async () => {
      await rm(path.join(root, 'node_modules'), {
        recursive: true,
        force: true,
      })
    })

    it('reuses the verdicts of an unchanged project', async () => {
      let events: RunEvent[] = []
      let first = await run(createWorld())
      let second = await run(createWorld(), {
        onProgress: event => {
          events.push(event)
        },
      })

      expect(first.result.cache).toBe(true)
      expect(first.result.results.some(entry => entry.cached)).toBe(false)
      expect(second.fake.calls.isolated).toStrictEqual([])
      expect(second.result.runs).toStrictEqual({ dry: 1 })
      expect(
        second.result.results.map(entry => [entry.status, entry.cached]),
      ).toStrictEqual(
        first.result.results.map(entry => [
          entry.status,
          entry.status !== 'Ignored' && entry.status !== 'NoCoverage',
        ]),
      )
      expect(events).toContainEqual({
        message: 'Reused cached verdicts for 3 of 4 mutants.',
        kind: 'note',
      })
    })

    it('reuses verdicts through a change outside their region only in incremental runs', async () => {
      let flag = path.join(root, 'src/flag.ts')
      let math = path.join(root, 'src/math.ts')
      let flagText = await readFile(flag, 'utf8')
      let mathText = await readFile(math, 'utf8')
      let [add] = ids['src/math.ts']!
      let [ratio, two] = ids['src/flag.ts']!
      /**
       * Lists the mutants a run ran isolated.
       *
       * @param outcome - Run and its simulated adapter.
       * @returns Ids of the mutants.
       */
      function ran(outcome: Awaited<ReturnType<typeof run>>): Set<string> {
        return new Set(
          outcome.fake.calls.isolated
            .flatMap(call => call.units)
            .map(unit => unit.mutant),
        )
      }
      /**
       * Builds the warning about the mutants whose cached evidence only their
       * region matched.
       *
       * @param message - Sentences of the warning.
       * @returns Diagnostic of the run with that message.
       */
      function warning(message: string): Diagnostic {
        return {
          code: 'incremental-reuse',
          severity: 'warning',
          column: null,
          file: null,
          line: null,
          message,
        }
      }
      try {
        await run(createWorld())
        await writeFile(flag, `${flagText}export let other = 5\n`)
        let incremental = await run(createWorld(), { incremental: true })
        let exact = await run(createWorld())
        await writeFile(flag, flagText.replace('2 * 3', '2 * 3, spare = 1'))
        let inside = await run(createWorld(), { incremental: true })
        await writeFile(math, `${mathText}export let unused = 1\n`)
        let single = await run(createWorld(), { incremental: true })

        expect(ran(incremental)).toStrictEqual(new Set())
        expect(incremental.result.diagnostics).toContainEqual(
          warning(
            '2 mutants have cached evidence that only their region matched, which a change elsewhere may have made stale; run with --no-incremental to check them.',
          ),
        )
        expect(ran(exact)).toStrictEqual(new Set([ratio, two]))
        expect(ran(inside)).toStrictEqual(new Set([ratio, two]))
        expect(
          inside.result.results.find(entry => entry.mutant.id === add)?.cached,
        ).toBe(true)
        expect(
          [exact, inside].flatMap(outcome =>
            outcome.result.diagnostics.filter(
              diagnostic => diagnostic.code === 'incremental-reuse',
            ),
          ),
        ).toStrictEqual([])
        expect(single.result.diagnostics).toContainEqual(
          warning(
            '1 mutant has cached evidence that only its region matched, which a change elsewhere may have made stale; run with --no-incremental to check it.',
          ),
        )
      } finally {
        await writeFile(flag, flagText)
        await writeFile(math, mathText)
      }
    })

    it('names a single reused verdict', async () => {
      let events: RunEvent[] = []
      let world = createWorld({
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [ids['src/math.ts']![0]!],
            id: 'math',
          },
        ],
      })
      await run(world, { paths: ['src/math.ts'] })
      await run(world, {
        onProgress: event => {
          events.push(event)
        },
        paths: ['src/math.ts'],
      })

      expect(events).toContainEqual({
        message: 'Reused a cached verdict for 1 of 1 mutants.',
        kind: 'note',
      })
    })

    it('neither reads nor saves verdicts when it is off', async () => {
      await run(createWorld(), { cache: false })

      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')

      useRunConfig({ cache: false })
      await run(createWorld())

      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')

      useRunConfig({ cache: false })
      let { result } = await run(createWorld(), { cache: true })

      expect(result.cache).toBe(true)
      await expect(stat(cacheFile())).resolves.toBeDefined()
    })

    it('is off for an adapter without cache support', async () => {
      let { result } = await run(createWorld({ cacheInputs: undefined }))

      expect(result.cache).toBe(false)
      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')
    })

    it('saves nothing from a run with error diagnostics', async () => {
      let skipped = expect.objectContaining({
        message:
          'Verdicts were not cached because the run had errors; the next run will run these mutants again.',
        code: 'cache-skipped',
        severity: 'warning',
      }) as unknown
      let bad = path.join(root, 'src/bad.ts')
      await writeFile(bad, 'let = ;\n')
      try {
        let { result } = await run(createWorld())

        expect(result.diagnostics).toContainEqual(skipped)
        await expect(stat(cacheFile())).rejects.toThrow('ENOENT')
      } finally {
        await rm(bad)
      }
      let { result } = await run(
        createWorld({
          diagnostics: [
            {
              code: 'instrumentation-break',
              message: 'Broken.',
              severity: 'error',
              column: null,
              file: null,
              line: null,
            },
          ],
        }),
      )

      expect(result.diagnostics).toContainEqual(skipped)
      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')
    })

    it('warns when the cache cannot be saved', async () => {
      await mkdir(path.join(cacheFile(), 'inside'), { recursive: true })
      let { result } = await run(createWorld())

      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          message: expect.stringMatching(
            /^The cache could not be saved to node_modules\/\.cache\/mootant\/run-v\d+\.json \(.+\); the next run will not reuse the verdicts of this one\.$/u,
          ) as unknown,
          code: 'cache-write-failed',
          severity: 'warning',
        }),
      )
    })

    it('reuses batch kills in fast mode', async () => {
      await run(createWorld(), { fast: true })
      let { result, fake } = await run(createWorld(), { fast: true })

      expect(fake.calls.batch).toStrictEqual([])
      expect(fake.calls.isolated).toStrictEqual([])
      expect(
        result.results.find(entry => entry.status === 'Killed'),
      ).toMatchObject({ path: 'batch', cached: true })
    })
  })
})
