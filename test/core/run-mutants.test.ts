import {
  writeFile,
  readFile,
  realpath,
  mkdtemp,
  utimes,
  mkdir,
  stat,
  rm,
} from 'node:fs/promises'
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
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { RunCacheFile } from '../../types/cache/run-cache-file'
import type { DrySnapshot } from '../../types/cache/dry-snapshot'
import type { FakeWorld } from '../helpers/create-fake-adapter'
import type { Diagnostic } from '../../types/mutant/diagnostic'
import type { RunConfig } from '../../types/config/run-config'
import type { RunEvent } from '../../types/run/run-event'

import { createSwitchedFiles } from '../../core/instrument/create-switched-files'
import { getDrySnapshotPath } from '../../core/cache/get-dry-snapshot-path'
import { saveDrySnapshot } from '../../core/cache/save-dry-snapshot'
import { hashProjectTree } from '../../core/cache/hash-project-tree'
import { readChangedLines } from '../../core/git/read-changed-lines'
import { createFakeAdapter } from '../helpers/create-fake-adapter'
import { getCachePath } from '../../core/cache/get-cache-path'
import { createBuiltIns } from '../helpers/create-built-ins'
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

vi.mock(import('../../core/cache/save-dry-snapshot'), async importOriginal => {
  let actual = await importOriginal()
  return { saveDrySnapshot: vi.fn(actual.saveDrySnapshot) }
})

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Ids of the pending mutants of each source file, by display path.
 */
let ids: Record<string, string[]> = {}

/**
 * Runs the mutants of the project with a fake adapter and a signal, as `run`
 * does, and catches what the run rejects with.
 *
 * @param world - Builds the simulated tests of the project with the controller
 *   of the signal, so they can abort it.
 * @param options - Builds options of the run that differ, with the controller.
 * @returns The controller, the fake adapter and the rejection, or undefined.
 */
async function interrupt(
  world: (controller: AbortController) => FakeWorld,
  options: (
    controller: AbortController,
  ) => Partial<Parameters<typeof runMutants>[0]> = () => ({}),
): Promise<{
  fake: ReturnType<typeof createFakeAdapter>
  controller: AbortController
  error: unknown
}> {
  let controller = new AbortController()
  let fake = createFakeAdapter(world(controller))
  if (vi.mocked(loadConfig).getMockImplementation() === undefined) {
    vi.mocked(loadConfig).mockResolvedValue(null)
  }
  let error: unknown
  try {
    await runMutants({
      builtIns: createBuiltIns('fake', fake.adapter),
      signal: controller.signal,
      paths: ['src'],
      cwd: root,
      ...options(controller),
    })
  } catch (error_) {
    error = error_
  }
  return { controller, error, fake }
}

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
    builtIns: createBuiltIns('fake', fake.adapter),
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

  it('adds what the adapter tells as it closes to the diagnostics of a run that went through', async () => {
    let [add] = ids['src/math.ts']!
    let teardown: Diagnostic = {
      message: "Jest's global teardown failed.",
      code: 'teardown-failed',
      severity: 'error',
      column: null,
      file: null,
      line: null,
    }
    let { result, fake } = await run({
      tests: [
        {
          file: path.join(root, 'test/math.test.ts'),
          kills: { [add!]: 'expected 3 to be -1' },
          covers: [add!],
          id: 'math',
        },
      ],
      closeDiagnostics: [teardown],
    })

    expect(fake.closed).toBe(1)
    expect(result.diagnostics.at(-1)).toStrictEqual(teardown)
  })

  it('closes the adapter of a run that fails and lets the failure through, whatever the close tells', async () => {
    let [add] = ids['src/math.ts']!
    let fake = createFakeAdapter({
      closeDiagnostics: [
        {
          message: "Jest's global teardown failed.",
          code: 'teardown-failed',
          severity: 'error',
          column: null,
          file: null,
          line: null,
        },
      ],
      tests: [
        {
          file: path.join(root, 'test/math.test.ts'),
          covers: [add!],
          dry: 'failing',
          id: 'math',
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(null)

    await expect(
      runMutants({
        builtIns: createBuiltIns('fake', fake.adapter),
        paths: ['src'],
        cwd: root,
      }),
    ).rejects.toThrow('Tests fail without mutants')
    expect(fake.closed).toBe(1)
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

  it('hosts every pending mutant of the paths and switches only the files of the selected mutants', async () => {
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
    ).toStrictEqual([
      ['src/flag.ts', ids['src/flag.ts']],
      ['src/math.ts', ids['src/math.ts']],
    ])
    expect(
      fake.context!.files.map(entry => path.relative(root, entry.file)),
    ).toStrictEqual(['src/flag.ts'])
    expect(fake.calls.isolated.flatMap(call => call.units)).toHaveLength(1)
  })

  it('relates the dry run of some mutants to every file that a run of all of them switches', async () => {
    let [add] = ids['src/math.ts']!
    vi.mocked(readChangedLines).mockResolvedValue({
      files: new Map([[path.join(root, 'src/math.ts'), new Set([2])]]),
      base: 'abc123',
    })
    let note = path.join(root, 'src/note.ts')
    await writeFile(note, '// mootant-ignore-file\nexport let note = 1 + 2\n')
    try {
      let runs = [
        await run({ tests: [] }),
        await run({ tests: [] }, { mutantIds: [add!] }),
        await run({ tests: [] }, { since: 'main' }),
      ]

      /**
       * A run of every mutant switches neither the Astro component nor the file
       * whose mutants are all ignored.
       */
      expect(
        runs.map(({ fake }) => [
          fake.context!.files.map(entry => path.relative(root, entry.file)),
          fake.calls.dry[0]!.related.map(file => path.relative(root, file)),
        ]),
      ).toStrictEqual([
        [
          ['src/flag.ts', 'src/math.ts'],
          ['src/flag.ts', 'src/math.ts'],
        ],
        [['src/math.ts'], ['src/flag.ts', 'src/math.ts']],
        [['src/math.ts'], ['src/flag.ts', 'src/math.ts']],
      ])
    } finally {
      await rm(note)
    }
  })

  it('relates no dry run to a file whose mutants cannot be hosted, whether its mutants run or not', async () => {
    let [add] = ids['src/math.ts']!
    let flag = path.join(root, 'src/flag.ts')
    vi.mocked(readChangedLines).mockResolvedValue({
      files: new Map([[path.join(root, 'src/math.ts'), new Set([2])]]),
      base: 'abc123',
    })
    let host = vi.mocked(createSwitchedFiles).getMockImplementation()!
    vi.mocked(createSwitchedFiles).mockImplementation((files, compilers) => {
      let built = host(files, compilers)
      return {
        diagnostics: [
          ...built.diagnostics,
          {
            message: 'Cannot host the mutants of src/flag.ts.',
            code: 'instrument-error',
            file: 'src/flag.ts',
            severity: 'error',
            column: null,
            line: null,
          },
        ],
        switched: built.switched.filter(entry => entry.file !== flag),
      }
    })
    try {
      let runs = [
        await run({ tests: [] }),
        await run({ tests: [] }, { mutantIds: [add!] }),
        await run({ tests: [] }, { since: 'main' }),
      ]

      /**
       * Only the run that selects the mutants of `src/flag.ts` reports them.
       */
      expect(
        runs.map(({ result, fake }) => [
          fake.context!.files.map(entry => path.relative(root, entry.file)),
          fake.calls.dry[0]!.related.map(file => path.relative(root, file)),
          result.diagnostics
            .filter(diagnostic => diagnostic.code === 'instrument-error')
            .map(diagnostic => diagnostic.file),
        ]),
      ).toStrictEqual([
        [['src/math.ts'], ['src/math.ts'], ['src/flag.ts']],
        [['src/math.ts'], ['src/math.ts'], []],
        [['src/math.ts'], ['src/math.ts'], []],
      ])
    } finally {
      vi.mocked(createSwitchedFiles).mockImplementation(host)
    }
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

  it('runs the units of one test file at once only with an adapter that has parallel units', async () => {
    let [ratio, two] = ids['src/flag.ts']!
    /**
     * Runs the two mutants of one test file and lists what the run told the
     * adapter and the progress.
     *
     * @param adapter - Whether the adapter has parallel units, or undefined
     *   when it does not tell.
     * @param options - What the run asks for, over the defaults.
     * @returns Whether the context allowed parallel units and the result says
     *   they ran, the notes and the chains of the isolated round.
     */
    async function runFlag(
      adapter: undefined | boolean,
      options: Partial<Parameters<typeof runMutants>[0]>,
    ): Promise<{
      context: undefined | boolean
      chains: number[][]
      notes: string[]
      ran: boolean
    }> {
      let events: RunEvent[] = []
      let { result, fake } = await run(
        {
          tests: [
            {
              file: path.join(root, 'test/flag.test.ts'),
              covers: [ratio!, two!],
              id: 'flag',
            },
          ],
          parallelUnits: adapter,
        },
        {
          onProgress: event => {
            events.push(event)
          },
          paths: ['src/flag.ts'],
          cache: false,
          ...options,
        },
      )
      return {
        chains: events.flatMap(event =>
          event.kind === 'run-start' ? [event.chains] : [],
        ),
        notes: events.flatMap(event =>
          event.kind === 'note' ? [event.message] : [],
        ),
        context: fake.context!.parallelUnits,
        ran: result.parallelUnits,
      }
    }

    await expect(runFlag(true, { parallelUnits: true })).resolves.toStrictEqual(
      { chains: [[0, 1]], context: true, notes: [], ran: true },
    )
    await expect(runFlag(true, {})).resolves.toStrictEqual({
      chains: [[0, 0]],
      context: false,
      ran: false,
      notes: [],
    })
    useRunConfig({ parallelUnits: true })
    await expect(runFlag(undefined, {})).resolves.toStrictEqual({
      notes: [
        'fake has no parallel units, so each test file runs for one mutant at a time, as a run without --parallel-units does.',
      ],
      chains: [[0, 0]],
      context: false,
      ran: false,
    })
    await expect(
      runFlag(true, { parallelUnits: false }),
    ).resolves.toStrictEqual({
      chains: [[0, 0]],
      context: false,
      ran: false,
      notes: [],
    })
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

  it('lists the skipped candidates of a run that writes an HTML report', async () => {
    let [add] = ids['src/math.ts']!
    let tests = [
      {
        file: path.join(root, 'test/math.test.ts'),
        covers: [add!],
        id: 'math',
      },
    ]
    useRunConfig({ html: 'out/report.html' })
    let configured = await run({ tests })
    let picked = await run({ tests }, { mutantIds: [add!] })
    let asked = await run({ tests }, { mutantIds: [add!], html: true })
    useRunConfig({})
    let defaulted = await run({ tests }, { html: true })
    useRunConfig({ html: true })
    let refused = await run({ tests }, { html: false })

    /**
     * Lists what the skipped candidates of `src/math.ts` would write.
     *
     * @param result - Result of a run.
     * @returns Replacements of the skipped candidates.
     */
    function math(result: Awaited<ReturnType<typeof runMutants>>): string[] {
      return result.files
        .find(file => file.file === 'src/math.ts')!
        .skipped.map(entry => entry.replacement)
    }

    expect(configured.result.html).toBe(path.join(root, 'out/report.html'))
    expect(picked.result.html).toBeNull()
    expect(asked.result.html).toBe(path.join(root, 'out/report.html'))
    expect(defaulted.result.html).toBe(path.join(root, '.mootant/report.html'))
    expect(refused.result.html).toBeNull()
    expect(math(configured.result)).toStrictEqual(['0'])
    expect(math(refused.result)).toStrictEqual([])
  })

  it('lists the skip of a plugin mutator under the rule of its plugin in a run that writes an HTML report', async () => {
    let [add] = ids['src/math.ts']!
    vi.mocked(loadConfig).mockResolvedValue({
      config: {
        plugins: {
          acme: {
            mutators: {
              swap: {
                create: context => ({
                  BinaryExpression: node => [
                    {
                      skip: {
                        reason: 'it adds the same numbers',
                        rule: 'same-sum',
                      },
                      text: `${context.sourceCode.getText(node.right)} + ${context.sourceCode.getText(node.left)}`,
                      node,
                    },
                  ],
                }),
                meta: { description: 'Swaps the operands of a sum.' },
              },
            },
            skipRules: {
              'same-sum': { category: 'equivalent', heuristic: false },
            },
          },
        },
        mutators: { 'acme/swap': 'on' },
      },
      file: path.join(root, 'mootant.config.js'),
      directory: root,
    })
    let { result } = await run(
      {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            id: 'math',
          },
        ],
      },
      { html: true },
    )

    expect(result.html).toBe(path.join(root, '.mootant/report.html'))
    expect(
      result.files
        .find(file => file.file === 'src/math.ts')!
        .skipped.filter(entry => entry.mutator === 'acme/swap')
        .map(entry => [entry.rule, entry.category, entry.heuristic]),
    ).toStrictEqual([['acme/same-sum', 'equivalent', false]])
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

  it('runs the mutants that skipped changes on changed lines are left to, as list lists them', async () => {
    let access = path.join(root, 'src/access.ts')
    await writeFile(
      access,
      [
        'export function open(user: { isAdmin: boolean }, door: { open(): void }): void {',
        '  if (user.isAdmin) {',
        '    door.open()',
        '  }',
        '}',
        '',
      ].join('\n'),
    )
    vi.mocked(readChangedLines).mockResolvedValue({
      files: new Map([[access, new Set([3])]]),
      base: 'abc123',
    })
    vi.mocked(loadConfig).mockResolvedValue(null)
    try {
      let listed = await listMutants({
        paths: ['src'],
        since: 'main',
        cwd: root,
      })
      let owners = listed.files.flatMap(file =>
        file.mutants.map(mutant => mutant.id),
      )
      let file = path.join(root, 'test/access.test.ts')
      let world: FakeWorld = {
        tests: [{ covers: owners, id: 'access', kills: {}, file }],
        files: [{ file }],
      }

      let { result } = await run(world, { since: 'main' })
      let { result: pinned } = await run(world, {
        mutantIds: [owners[1]!],
        since: 'main',
      })

      expect(
        listed.files.flatMap(entry =>
          entry.mutants.map(mutant => [mutant.mutator, mutant.replacement]),
        ),
      ).toStrictEqual([
        ['condition', 'true'],
        ['condition', 'false'],
      ])
      expect(
        result.results.map(verdict => [verdict.mutant.id, verdict.status]),
      ).toStrictEqual(owners.map(id => [id, 'Survived']))
      expect(
        result.files.map(entry => [entry.file, entry.skipped]),
      ).toStrictEqual([['src/access.ts', []]])
      expect(pinned.results.map(verdict => verdict.mutant.id)).toStrictEqual([
        owners[1],
      ])
    } finally {
      await rm(access)
    }
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
        confirming: 0,
        survivors: 0,
        retrying: 0,
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

  describe('with a signal', () => {
    /**
     * Builds a project whose test kills the mutant of `src/math.ts`.
     *
     * @param fields - Changes to the simulated project.
     * @returns Simulated project.
     */
    function createWorld(fields: Partial<FakeWorld> = {}): FakeWorld {
      let [add] = ids['src/math.ts']!
      return {
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            kills: { [add!]: 'expected 3 to be -1' },
            covers: [add!],
            id: 'math',
          },
        ],
        ...fields,
      }
    }

    it('gives the adapter the signal and decides the run as without one', async () => {
      let controller = new AbortController()
      let plain = await run(createWorld())
      let signalled = await run(createWorld(), { signal: controller.signal })

      expect(signalled.fake.context!.signal).toBe(controller.signal)
      expect(plain.fake.context!.signal!.aborted).toBe(false)
      expect(signalled.result.results.map(entry => entry.status)).toStrictEqual(
        plain.result.results.map(entry => entry.status),
      )
    })

    it('starts no test runner once the signal aborts while the mutants are listed', async () => {
      let { controller, error, fake } = await interrupt(
        () => createWorld(),
        aborting => ({
          onProgress: () => {
            aborting.abort()
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(fake.context).toBeNull()
    })

    it('drops a dry run that ends after the signal, closes the session and removes the work directory', async () => {
      let { controller, error, fake } = await interrupt(aborting =>
        createWorld({
          onDry: result => {
            aborting.abort()
            return result
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(fake.calls.dry).toHaveLength(1)
      expect(fake.calls.isolated).toStrictEqual([])
      expect(fake.closed).toBe(1)
      await expect(stat(fake.context!.workDirectory)).rejects.toThrow('ENOENT')
    })

    it('rejects with the reason of the signal when the interrupted run fails', async () => {
      let { controller, error } = await interrupt(aborting =>
        createWorld({
          onDry: () => {
            aborting.abort()
            throw new Error('The worker is gone.')
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
    })

    it('runs no later batch run once the signal aborts during one in fast mode', async () => {
      let { controller, error, fake } = await interrupt(
        aborting =>
          createWorld({
            onBatch: result => {
              aborting.abort()
              return result
            },
          }),
        () => ({ fast: true }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(fake.calls.batch).toHaveLength(1)
      expect(fake.calls.isolated).toStrictEqual([])
      expect(fake.closed).toBe(1)
    })

    it('asks nothing of a session that starts after the signal and closes it', async () => {
      let reason = new Error('Interrupted.')
      let controller = new AbortController()
      let workDirectory = ''
      let session = {
        close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        listTestFiles: vi.fn<() => Promise<string[]>>(),
        runIsolated: vi.fn(),
        runBatch: vi.fn(),
        dryRun: vi.fn(),
      }
      useRunConfig({
        runner: {
          start: context => {
            ;({ workDirectory } = context)
            controller.abort(reason)
            return Promise.resolve(session)
          },
          name: 'late',
          batch: false,
        },
      })

      await expect(
        runMutants({
          signal: controller.signal,
          paths: ['src'],
          builtIns: {},
          cwd: root,
        }),
      ).rejects.toBe(reason)
      expect(session.listTestFiles).not.toHaveBeenCalled()
      expect(session.close).toHaveBeenCalledExactlyOnceWith()
      await expect(stat(workDirectory)).rejects.toThrow('ENOENT')
    })
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

    /**
     * Finds the saved dry run of the project.
     *
     * @returns Absolute path of the file.
     */
    function snapshotFile(): string {
      return getDrySnapshotPath(root)
    }

    /**
     * Runs the project and collects the notes of the run.
     *
     * @param world - Simulated project.
     * @returns Result of the run, the fake adapter and the notes.
     */
    async function runNoted(
      world: FakeWorld,
    ): Promise<Awaited<ReturnType<typeof run>> & { notes: string[] }> {
      let notes: string[] = []
      let ran = await run(world, {
        onProgress: event => {
          if (event.kind === 'note') {
            notes.push(event.message)
          }
        },
      })
      return { ...ran, notes }
    }

    /**
     * Summarizes the verdicts of a run.
     *
     * @param ran - A run.
     * @param ran.result - Result of the run.
     * @returns Id, status, cause and whether it was cached, of each mutant.
     */
    function summarize(ran: Awaited<ReturnType<typeof run>>): unknown[] {
      return ran.result.results.map(entry => [
        entry.mutant.id,
        entry.status,
        entry.cause,
        entry.cached,
      ])
    }

    /**
     * Summarizes the verdict of one mutant of a run.
     *
     * @param ran - A run.
     * @param ran.result - Result of the run.
     * @param id - Id of the mutant.
     * @returns Status, cause and whether it was cached.
     */
    function summarizeOne(
      ran: Awaited<ReturnType<typeof run>>,
      id: string,
    ): unknown[] {
      let entry = ran.result.results.find(found => found.mutant.id === id)!
      return [entry.status, entry.cause, entry.cached]
    }

    /**
     * Writes a file with a modification time before the next run.
     *
     * @param file - Absolute path.
     * @param text - Content.
     */
    async function writeBefore(file: string, text: string): Promise<void> {
      let past = new Date(Date.now() - 10_000)
      await writeFile(file, text)
      await utimes(file, past, past)
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
      await rm(snapshotFile())
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

    it('replays the dry run of an unchanged project without the test runner, with the verdicts of a warm run', async () => {
      let events: RunEvent[] = []
      await run(createWorld())
      let replayed = await run(createWorld(), {
        onProgress: event => {
          events.push(event)
        },
      })
      await rm(snapshotFile())
      let warm = await run(createWorld())

      expect(replayed.fake.context).toBeNull()
      expect(replayed.result.runs).toStrictEqual({})
      expect(warm.result.runs).toStrictEqual({ dry: 1 })
      expect(replayed.result.results).toStrictEqual(warm.result.results)
      expect(replayed.result.tests).toStrictEqual(warm.result.tests)
      expect(replayed.result.diagnostics).toStrictEqual(warm.result.diagnostics)
      expect(replayed.result.cache).toBe(true)
      expect(events.map(event => event.kind)).toStrictEqual([
        'mutants',
        'note',
        'note',
        'verdicts',
      ])
      expect(events.filter(event => event.kind === 'note')).toStrictEqual([
        {
          message:
            'Reused the dry run of an earlier run, as nothing it depended on changed, so the test runner did not start.',
          kind: 'note',
        },
        {
          message: 'Reused cached verdicts for 3 of 4 mutants.',
          kind: 'note',
        },
      ])
    })

    it('starts the test runner, with a note why, once anything the saved dry run depended on changed', async () => {
      let test = path.join(root, 'test/math.test.ts')
      let added = path.join(root, 'added.txt')
      /**
       * Runs the project and tells what became of the saved dry run.
       *
       * @returns Whether the test runner started, and the notes but the count
       *   of cached verdicts.
       */
      async function getMiss(): Promise<[boolean, string[]]> {
        let { notes, fake } = await runNoted(createWorld())
        return [
          fake.context !== null,
          notes.filter(note => !note.startsWith('Reused cached')),
        ]
      }
      /**
       * Builds the note of a missed replay.
       *
       * @param reason - What changed.
       * @returns The note.
       */
      function missed(reason: string): string {
        return `Did not reuse the dry run of an earlier run, as ${reason}.`
      }
      await mkdir(path.dirname(test), { recursive: true })
      await writeBefore(test, 'test')
      try {
        await run(createWorld())
        await writeBefore(test, 'changed')

        await expect(getMiss()).resolves.toStrictEqual([
          true,
          [missed('test/math.test.ts changed')],
        ])

        await writeFile(added, 'a file anywhere in the project')

        await expect(getMiss()).resolves.toStrictEqual([
          true,
          [missed('a file of the project was added, removed or changed')],
        ])

        /* Cspell:disable-next-line */
        vi.stubEnv('MOOTANT_REPLAY_VARIABLE', 'set')

        await expect(getMiss()).resolves.toStrictEqual([
          true,
          [missed('an environment variable changed')],
        ])

        useRunConfig({ hitLimit: { floor: 1000, factor: 10 } })

        await expect(getMiss()).resolves.toStrictEqual([
          true,
          [
            missed(
              'the settings, the versions or the working directory changed',
            ),
          ],
        ])
        vi.stubEnv('SHLVL', '99')

        await expect(getMiss()).resolves.toStrictEqual([
          false,
          [
            'Reused the dry run of an earlier run, as nothing it depended on changed, so the test runner did not start.',
          ],
        ])
      } finally {
        /* Cspell:disable-next-line */
        vi.unstubAllEnvs()
        await rm(path.dirname(test), { recursive: true, force: true })
        await rm(added, { force: true })
      }
    })

    it('falls back to the test runner when the saved dry run cannot be replayed', async () => {
      await run(createWorld())
      let snapshot = JSON.parse(
        await readFile(snapshotFile(), 'utf8'),
      ) as DrySnapshot
      await writeFile(
        snapshotFile(),
        JSON.stringify({ ...snapshot, phase: { dry: {} } }),
      )
      let { result, notes, fake } = await runNoted(createWorld())

      expect(fake.context).not.toBeNull()
      expect(result.runs).toStrictEqual({ dry: 1 })
      expect(notes[0]).toMatch(
        /^Did not reuse the dry run of an earlier run, as it could not be replayed \(.+\)\.$/u,
      )
    })

    it('saves neither verdicts nor the dry run once the signal aborts during an isolated run', async () => {
      let { controller, error, fake } = await interrupt(aborting =>
        createWorld({
          onIsolated: result => {
            aborting.abort()
            return result
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(fake.calls.isolated).toHaveLength(1)
      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')
      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
    })

    it('replays no saved dry run once the signal aborts while the mutants are listed', async () => {
      await run(createWorld())
      let notes: string[] = []
      /**
       * Aborts the run on its first event and keeps its notes.
       *
       * @param event - Event of the run.
       * @param controller - Controller of the signal of the run.
       */
      function abortAndNote(
        event: RunEvent,
        controller: AbortController,
      ): void {
        if (event.kind === 'note') {
          notes.push(event.message)
        }
        controller.abort()
      }
      let { controller, error, fake } = await interrupt(
        () => createWorld(),
        aborting => ({
          onProgress: event => {
            abortAndNote(event, aborting)
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(notes).toStrictEqual([])
      expect(fake.context).toBeNull()
    })

    it('starts no test runner once the signal aborts while a saved dry run is checked', async () => {
      await run(createWorld())
      let snapshot = JSON.parse(
        await readFile(snapshotFile(), 'utf8'),
      ) as DrySnapshot
      await writeFile(
        snapshotFile(),
        JSON.stringify({ ...snapshot, phase: { dry: {} } }),
      )
      let notes: string[] = []
      /**
       * Aborts the run on its first note, the one of the missed replay.
       *
       * @param event - Event of the run.
       * @param controller - Controller of the signal of the run.
       */
      function abortOnNote(event: RunEvent, controller: AbortController): void {
        if (event.kind === 'note') {
          notes.push(event.message)
          controller.abort()
        }
      }
      let { controller, error, fake } = await interrupt(
        () => createWorld(),
        aborting => ({
          onProgress: event => {
            abortOnNote(event, aborting)
          },
        }),
      )

      expect(error).toBe(controller.signal.reason)
      expect(notes).toHaveLength(1)
      expect(fake.context).toBeNull()
    })

    it('neither reuses nor saves a dry run with --mutant or --since, in fast mode or without the cache', async () => {
      let [add] = ids['src/math.ts']!
      await run(createWorld(), { mutantIds: [add!] })

      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')

      vi.mocked(readChangedLines).mockResolvedValue({
        files: new Map([[path.join(root, 'src/math.ts'), new Set([2])]]),
        base: 'abc123',
      })
      await run(createWorld(), { since: 'main' })

      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')

      let full = await run(createWorld())
      let saved = await readFile(snapshotFile(), 'utf8')
      let picked = await run(createWorld(), { mutantIds: [add!] })
      let changed = await run(createWorld(), { since: 'main' })
      let fast = await run(createWorld(), { fast: true })
      let off = await run(createWorld(), { cache: false })

      expect(full.fake.context).not.toBeNull()
      expect(picked.fake.context).not.toBeNull()
      expect(changed.fake.context).not.toBeNull()
      expect(fast.fake.context).not.toBeNull()
      expect(off.fake.context).not.toBeNull()
      await expect(readFile(snapshotFile(), 'utf8')).resolves.toBe(saved)
    })

    it('saves no dry run when the session tells something as it closes, and removes the saved one', async () => {
      let warning: Diagnostic = {
        message: 'Global teardown was stopped.',
        code: 'teardown-failed',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      }
      let loud = createWorld({ closeDiagnostics: [warning] })
      await run(loud)

      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')

      await run(createWorld({ closeDiagnostics: [] }))
      await stat(snapshotFile())
      await rm(cacheFile())
      let again = await run(loud)

      expect(again.fake.context).not.toBeNull()
      expect(again.result.diagnostics).toContainEqual(warning)
      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
    })

    it('saves no dry run when a file of the project appears while mutants run, with a note that names it', async () => {
      let late = path.join(root, 'late.test.ts')
      try {
        let { notes } = await runNoted(
          createWorld({
            onIsolated: (result, _plan, call) => {
              if (call === 1) {
                writeFileSync(late, 'test')
              }
              return result
            },
          }),
        )

        expect(notes).toContain(
          'Did not save the dry run for later runs, as late.test.ts was added during the run.',
        )
        await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
        await expect(run(createWorld())).resolves.toMatchObject({
          result: { runs: { dry: 1 } },
        })
      } finally {
        await rm(late, { force: true })
      }
    })

    it('saves no dry run when a test file has no key, such as one that read a pipe', async () => {
      let pipe = path.join(root, 'pipe')
      let world = createWorld()
      /* Cspell:disable-next-line */
      execFileSync('mkfifo', [pipe])
      try {
        await run({
          ...world,
          tests: [
            ...world.tests,
            {
              file: path.join(root, 'test/pipe.test.ts'),
              covers: [ids['src/flag.ts']![0]!],
              id: 'pipe',
            },
          ],
          files: [
            {
              file: path.join(root, 'test/pipe.test.ts'),
              dependencies: [pipe],
            },
          ],
        })

        await expect(stat(cacheFile())).resolves.toBeDefined()
        await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
      } finally {
        await rm(pipe)
      }
    })

    it('would replay a stale dry run without the hash of the project tree', async () => {
      let [ratio] = ids['src/flag.ts']!
      let killer = path.join(root, 'test/flag.test.ts')
      let base = createWorld()
      let world = {
        ...base,
        tests: [
          ...base.tests,
          {
            kills: { [ratio!]: 'expected 6 to be 7' },
            covers: [ratio!],
            file: killer,
            id: 'flag',
          },
        ],
      }
      /**
       * Gives the verdict of the mutant the new test file kills.
       *
       * @param ran - A run.
       * @returns Status of the mutant.
       */
      function getStatus(ran: Awaited<ReturnType<typeof run>>): string {
        return ran.result.results.find(entry => entry.mutant.id === ratio)!
          .status
      }
      await run(base)
      await mkdir(path.dirname(killer), { recursive: true })
      await writeFile(killer, 'test')
      try {
        let snapshot = JSON.parse(
          await readFile(snapshotFile(), 'utf8'),
        ) as DrySnapshot
        await writeFile(
          snapshotFile(),
          JSON.stringify({
            ...snapshot,
            tree: (await hashProjectTree(root, []))!.hash,
          }),
        )
        let forged = await run(world)
        await writeFile(snapshotFile(), JSON.stringify(snapshot))
        let checked = await run(world)

        expect(forged.fake.context).toBeNull()
        expect(getStatus(forged)).toBe('Survived')
        expect(checked.fake.context).not.toBeNull()
        expect(getStatus(checked)).toBe('Killed')
      } finally {
        await rm(path.dirname(killer), { recursive: true, force: true })
      }
    })

    it('caches a timeout by the hit limit once a unit with the raised limit confirmed it, and replays it', async () => {
      let [add] = ids['src/math.ts']!
      let [ratio, two] = ids['src/flag.ts']!
      let world = createWorld({
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!, ratio!, two!],
            loops: [add!],
            hot: [ratio!],
            id: 'math',
          },
        ],
      })
      let first = await run(world)
      let stored = JSON.parse(
        await readFile(cacheFile(), 'utf8'),
      ) as RunCacheFile
      let replayed = await run(world)

      expect(summarizeOne(first, add!)).toStrictEqual([
        'Timeout',
        'hit-limit',
        false,
      ])
      expect(summarizeOne(first, ratio!)).toStrictEqual([
        'Survived',
        null,
        false,
      ])
      expect(
        Object.values(stored.entries)
          .map(entry => `${entry.status} ${entry.cause} ${entry.path}`)
          .toSorted(),
      ).toStrictEqual([
        'Survived null isolated',
        'Survived null isolated',
        'Timeout hit-limit isolated',
      ])
      expect(replayed.fake.context).toBeNull()
      expect(summarizeOne(replayed, add!)).toStrictEqual([
        'Timeout',
        'hit-limit',
        true,
      ])
      expect(summarizeOne(replayed, ratio!)).toStrictEqual([
        'Survived',
        null,
        true,
      ])
    })

    it.each<
      [string, (unit: IsolatedFacts) => IsolatedFacts, (string | null)[]]
    >([
      [
        'crashed',
        unit => ({
          ...unit,
          tests: unit.tests.map(test => ({ ...test, hits: 0 })),
          incomplete: 'crash',
          hits: 0,
        }),
        ['Killed', 'crash'],
      ],
      [
        'hung',
        unit => ({
          ...unit,
          tests: unit.tests.map(test => ({ ...test, hits: 0 })),
          incomplete: 'hang',
          hits: 0,
        }),
        ['Timeout', 'hang'],
      ],
      [
        'ran out of time',
        unit => ({
          ...unit,
          tests: unit.tests.map(test => ({ ...test, timedOut: true, hits: 0 })),
          hits: 0,
        }),
        ['Timeout', 'time-limit'],
      ],
      [
        'decided nothing',
        unit => ({
          ...unit,
          tests: unit.tests.map(test => ({
            ...test,
            reached: false,
            failed: false,
            hits: 0,
          })),
          reached: false,
          hits: 0,
        }),
        ['NoCoverage', null],
      ],
      ['went missing', unit => ({ ...unit, unit: -1 }), ['Error', null]],
    ])(
      'caches no timeout whose confirmation %s',
      async (_name, change, verdict) => {
        let [add] = ids['src/math.ts']!
        let world = createWorld({
          onIsolated: (result, _plan, call) =>
            call === 1 ? result : (
              {
                units: result.units.map(change).filter(unit => unit.unit >= 0),
              }
            ),
          tests: [
            {
              file: path.join(root, 'test/math.test.ts'),
              covers: [add!],
              loops: [add!],
              id: 'math',
            },
          ],
        })
        let first = await run(world)
        let stored = JSON.parse(
          await readFile(cacheFile(), 'utf8'),
        ) as RunCacheFile
        let second = await run(createWorld({ tests: world.tests }))

        expect(summarizeOne(first, add!)).toStrictEqual([...verdict, false])
        expect(Object.values(stored.entries)).toStrictEqual([])
        expect(second.fake.calls.isolated).not.toStrictEqual([])
        expect(summarizeOne(second, add!)).toStrictEqual([
          'Timeout',
          'hit-limit',
          false,
        ])
      },
    )

    it('reuses a timeout by the hit limit only in a run that switches the same files, either way', async () => {
      let [add] = ids['src/math.ts']!
      let world = createWorld({
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            loops: [add!],
            id: 'math',
          },
        ],
      })
      let picked = { mutantIds: [add!] }
      /**
       * Runs the project and tells whether the unit of the loop ran.
       *
       * @param options - Mutants to pick, every one by default.
       * @returns Whether a unit ran, and the verdict of the loop.
       */
      async function runLoop(
        options: Partial<Parameters<typeof runMutants>[0]> = {},
      ): Promise<unknown[]> {
        let ran = await run(world, options)
        return [ran.fake.calls.isolated.length > 0, ...summarizeOne(ran, add!)]
      }
      let timeout = ['Timeout', 'hit-limit']

      await expect(runLoop(picked)).resolves.toStrictEqual([
        true,
        ...timeout,
        false,
      ])
      await expect(runLoop(picked)).resolves.toStrictEqual([
        false,
        ...timeout,
        true,
      ])
      await expect(runLoop()).resolves.toStrictEqual([true, ...timeout, false])

      await rm(snapshotFile())

      await expect(runLoop()).resolves.toStrictEqual([false, ...timeout, true])
      await expect(runLoop(picked)).resolves.toStrictEqual([
        true,
        ...timeout,
        false,
      ])
    })

    it('starts the test runner for another configuration, concurrency or working directory', async () => {
      /**
       * Makes the run find a configuration file of the root.
       *
       * @param name - Base name of the file in the root.
       */
      function useConfigFile(name: string): void {
        vi.mocked(loadConfig).mockResolvedValue({
          file: path.join(root, name),
          directory: root,
          config: {},
        })
      }
      /**
       * Runs the project and tells whether the test runner started.
       *
       * @param options - Concurrency of the run, if any.
       * @returns Whether the adapter started, and the notes about the dry run.
       */
      async function runStarted(
        options: Partial<Parameters<typeof runMutants>[0]> = {},
      ): Promise<[boolean, string[]]> {
        let notes: string[] = []
        let ran = await run(createWorld(), {
          ...options,
          onProgress: event => {
            if (event.kind === 'note' && event.message.includes('dry run')) {
              notes.push(event.message)
            }
          },
        })
        return [ran.fake.context !== null, notes]
      }
      let changed = [
        'Did not reuse the dry run of an earlier run, as the settings, the versions or the working directory changed.',
      ]
      useConfigFile('mootant.config.js')
      await run(createWorld())
      useConfigFile('mootant.e2e.config.js')

      await expect(runStarted()).resolves.toStrictEqual([true, changed])
      await expect(runStarted({ concurrency: 2 })).resolves.toStrictEqual([
        true,
        changed,
      ])

      let cwd = vi.spyOn(process, 'cwd').mockReturnValue(path.join(root, 'src'))
      try {
        await expect(runStarted({ concurrency: 2 })).resolves.toStrictEqual([
          true,
          changed,
        ])
      } finally {
        cwd.mockRestore()
      }
    })

    it('counts the time it takes to save the dry run in the last phase', async () => {
      let actual = await vi.importActual<{
        saveDrySnapshot: typeof saveDrySnapshot
      }>('../../core/cache/save-dry-snapshot')
      vi.mocked(saveDrySnapshot).mockImplementationOnce(async input => {
        await new Promise(resolve => {
          setTimeout(resolve, 50)
        })
        return actual.saveDrySnapshot(input)
      })
      let { result } = await run(createWorld())
      let { timing } = result

      expect(timing.isolated).toBeGreaterThanOrEqual(49)
      expect(timing.total).toBeCloseTo(
        timing.startup + timing.dryRun + timing.isolated,
        2,
      )
      await expect(stat(snapshotFile())).resolves.toBeDefined()
    })

    it('saves the dry run while its work directory lies in the project', async () => {
      let temporary = path.join(root, '.tmp')
      await mkdir(temporary)
      vi.stubEnv('TMPDIR', temporary)
      try {
        await run(createWorld())

        await expect(stat(snapshotFile())).resolves.toBeDefined()
      } finally {
        /* Cspell:disable-next-line */
        vi.unstubAllEnvs()
        await rm(temporary, { recursive: true, force: true })
      }
    })

    it('reuses no timeout in fast mode', async () => {
      let [add] = ids['src/math.ts']!
      let world = createWorld({
        tests: [
          {
            file: path.join(root, 'test/math.test.ts'),
            covers: [add!],
            loops: [add!],
            id: 'math',
          },
        ],
      })
      await run(world)
      let fast = await run(world, { incremental: true, fast: true })
      let fresh = await run(world, { cache: false, fast: true })

      expect(fast.fake.calls.isolated).not.toStrictEqual([])
      expect(summarize(fast)).toStrictEqual(summarize(fresh))
      expect(fast.result.diagnostics).toStrictEqual(fresh.result.diagnostics)
    })

    it('keeps the verdicts of runs with parallel units apart from the others', async () => {
      let world = createWorld({ parallelUnits: true })
      await run(world, { parallelUnits: true })
      let parallel = await run(world, { parallelUnits: true })
      let serial = await run(world)
      let unable = await run(createWorld(), { parallelUnits: true })

      expect(parallel.fake.calls.isolated).toStrictEqual([])
      expect(serial.fake.calls.isolated).not.toStrictEqual([])
      expect(serial.result.results.some(entry => entry.cached)).toBe(false)
      expect(unable.fake.calls.isolated).toStrictEqual([])
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
      expect(result.diagnostics.map(entry => entry.code)).not.toContain(
        'cache-skipped',
      )
      await expect(stat(cacheFile())).rejects.toThrow('ENOENT')
      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
    })

    it('is off, with a warning that names the file, when a file every verdict depends on was modified at or after the start of the run', async () => {
      let config = path.join(root, 'fake.config.ts')
      let world = createWorld({
        cacheInputs: { files: [config], settings: null },
      })
      let past = new Date(Date.now() - 10_000_000)
      let future = new Date(Date.now() + 10_000_000)
      await writeFile(config, 'config')
      await utimes(config, past, past)
      try {
        await run(world)
        let saved = await readFile(cacheFile(), 'utf8')
        await utimes(config, future, future)
        let { result } = await run(world)

        expect(result.cache).toBe(false)
        expect(result.results.some(entry => entry.cached)).toBe(false)
        expect(result.diagnostics).toContainEqual({
          message:
            'Verdicts were neither reused nor cached because fake.config.ts has a modification time at or after the start of the run, so it may have changed while the run went on.',
          code: 'cache-skipped',
          severity: 'warning',
          column: null,
          file: null,
          line: null,
        })
        await expect(readFile(cacheFile(), 'utf8')).resolves.toBe(saved)
      } finally {
        await rm(config)
      }
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
        await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
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
      await expect(stat(snapshotFile())).rejects.toThrow('ENOENT')
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

    it('reuses a batch kill in fast mode after another covering test became the cheapest', async () => {
      let [add] = ids['src/math.ts']!
      let [ratio, two] = ids['src/flag.ts']!

      /**
       * Builds the project with a second test file that reaches the killed
       * mutant without killing it.
       *
       * @param killer - Dry duration of the test that kills the mutant.
       * @param other - Dry duration of the other test.
       * @returns The project.
       */
      function createTimedWorld(killer: number, other: number): FakeWorld {
        return createWorld({
          tests: [
            {
              file: path.join(root, 'test/math.test.ts'),
              kills: { [add!]: 'expected 3 to be -1' },
              covers: [add!, ratio!, two!],
              duration: killer,
              id: 'math',
            },
            {
              file: path.join(root, 'test/other.test.ts'),
              duration: other,
              covers: [add!],
              id: 'other',
            },
          ],
        })
      }
      await run(createTimedWorld(1, 2), { fast: true })
      let { result, fake } = await run(createTimedWorld(2, 1), { fast: true })

      expect(fake.calls.batch).toStrictEqual([])
      expect(
        result.results.find(entry => entry.mutant.id === add),
      ).toMatchObject({ killedBy: 'math', path: 'batch', cached: true })
    })
  })
})
