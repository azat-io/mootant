import type * as FileSystem from 'node:fs/promises'

import {
  writeFile,
  realpath,
  mkdtemp,
  utimes,
  mkdir,
  stat,
  rm,
} from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { CacheInputs } from '../../../types/adapter/cache-inputs'
import type { FileMutants } from '../../../types/mutant/file-mutants'
import type { StoredCache } from '../../../types/cache/stored-cache'
import type { Diagnostic } from '../../../types/mutant/diagnostic'
import type { FakeWorld } from '../../helpers/create-fake-adapter'
import type { RunCache } from '../../../types/cache/run-cache'

import { createTestRun, TEST_LIMITS } from '../../helpers/create-test-run'
import { prepareRunCache } from '../../../core/cache/prepare-run-cache'

vi.mock(import('node:fs/promises'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, stat: vi.fn(actual.stat) as never }
})

let actual = await vi.importActual<typeof FileSystem>('node:fs/promises')

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Prepares the cache of a run over a simulated project whose test file covers
 * `m1`, and records that `m1` survived it.
 *
 * @param world - Changes to the simulated project.
 * @param run - How the run goes.
 * @param run.stored - Entries and inputs of the cache file; empty by default.
 * @param run.started - Start of the run; by default no file changed during it.
 * @param run.incremental - Whether the run is incremental; false by default.
 * @param run.parallelUnits - Whether units of one test file run at once; left
 *   out by default.
 * @param run.fast - Whether the run is in fast mode; false by default.
 * @returns Cache of the run, or the warning of a run left without one.
 */
async function prepare(
  world: Partial<FakeWorld>,
  run: {
    parallelUnits?: boolean
    incremental?: boolean
    stored?: StoredCache
    started?: number
    fast?: boolean
  } = {},
): Promise<Awaited<ReturnType<typeof prepareRunCache>>> {
  let {
    stored = { entries: new Map(), inputs: new Map() },
    started = Number.POSITIVE_INFINITY,
    incremental = false,
    parallelUnits,
    fast = false,
  } = run
  let file = path.join(root, 'a.test.ts')
  let { session, state, fake } = await createTestRun(
    {
      tests: [{ covers: ['m1'], id: 'a1', file }],
      cacheInputs: createInputs(),
      ...world,
    },
    { mutants: ['m1'], isolate: true },
  )
  let dry = await session.dryRun({
    timeouts: { file: 60_000, test: 60_000 },
    related: ['/src/a.ts'],
    instrumented: true,
    repeat: false,
    files: null,
  })
  let prepared = await prepareRunCache({
    files: [
      {
        absolute: path.join(root, 'src/a.ts'),
        regions: new Map([['m1', 'r1']]),
        source: 'let a = 1',
        file: 'src/a.ts',
      },
      { absolute: path.join(root, 'src/b.ts'), file: 'src/b.ts', source: null },
    ] as FileMutants[],
    setup: { preset: 'recommended', mutators: [], settings: {} },
    switched: [path.join(root, 'src/a.ts')],
    stored: Promise.resolve(stored),
    analysis: state.analysis,
    adapter: fake.adapter,
    limits: TEST_LIMITS,
    parallelUnits,
    incremental,
    session,
    started,
    now: 1,
    fast,
    root,
    dry,
  })
  prepared.cache?.recordUnit(state.mutants.get('m1')!, file, {
    inputs: {
      dependencies: [file],
      environment: [],
    },
    verdict: 'survived',
  })
  return prepared
}

/**
 * Tells whether a second run reuses what the first recorded.
 *
 * @param first - Cache of the first run.
 * @param world - Changes to the simulated project of the second run.
 * @param incremental - Whether the second run is incremental; false by default.
 * @returns Whether the evidence of `m1` is reused.
 */
async function reuses(
  first: Pick<RunCache, 'entries' | 'inputs'>,
  world: Partial<FakeWorld> = {},
  incremental = false,
): Promise<boolean> {
  let file = path.join(root, 'a.test.ts')
  let { state } = await createTestRun(
    { tests: [{ covers: ['m1'], id: 'a1', file }] },
    { mutants: ['m1'], isolate: true },
  )
  let second = await prepare(world, {
    stored: { entries: first.entries, inputs: first.inputs },
    incremental,
  })
  return second.cache!.lookupUnit(state.mutants.get('m1')!, file) === 'survived'
}

/**
 * Builds the warning of a run that a file left without a cache.
 *
 * @param reason - Why the file did, its path first.
 * @returns The warning.
 */
function skipped(reason: string): Diagnostic {
  return {
    message: `Verdicts were neither reused nor cached because ${reason}`,
    code: 'cache-skipped',
    severity: 'warning',
    column: null,
    file: null,
    line: null,
  }
}

/**
 * Builds what the simulated session says every verdict depends on by default.
 *
 * @returns Cache inputs over the project of the tests.
 */
function createInputs(): CacheInputs {
  return {
    files: [path.join(root, 'vitest.config.ts')],
    environment: { '': { MODE: 'm1' } },
    settings: {},
  }
}

describe('prepareRunCache', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-prep-')))
    await writeFile(path.join(root, 'a.test.ts'), 'test')
    await writeFile(path.join(root, 'vitest.config.ts'), 'config')
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
    await mkdir(path.join(root, 'node_modules/.pnpm'), { recursive: true })
    await writeFile(path.join(root, 'node_modules/.package-lock.json'), '{}')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reuses evidence while nothing changed', async () => {
    let { cache } = await prepare({})

    expect(cache!.entries.size).toBe(1)
    await expect(reuses(cache!)).resolves.toBe(true)
    expect(
      (
        await prepare({
          cacheInputs: {
            files: [path.join(root, 'vitest.config.ts')],
            settings: {},
          },
        })
      ).cache,
    ).not.toBeNull()
    expect(
      (
        await prepare({
          onDry: result => ({
            ...result,
            files: result.files.map(({ environment, ...file }) => file),
          }),
        })
      ).cache,
    ).not.toBeNull()
  })

  it('reuses evidence after a reinstall of mootant, which gives its files other times', async () => {
    let own = path.resolve(
      import.meta.dirname,
      '../../../core/cache/prepare-run-cache.ts',
    )
    let time = 1
    vi.mocked(stat).mockImplementation(async (file, options) =>
      file === own ?
        Object.assign(await actual.stat(own), { mtimeMs: time })
      : actual.stat(file, options),
    )
    try {
      let { cache } = await prepare({})
      time = 2

      await expect(reuses(cache!)).resolves.toBe(true)
    } finally {
      vi.mocked(stat).mockReset()
    }
  })

  it('keeps the evidence of runs with parallel units apart from the others', async () => {
    let file = path.join(root, 'a.test.ts')
    let { state } = await createTestRun(
      { tests: [{ covers: ['m1'], id: 'a1', file }] },
      { mutants: ['m1'], isolate: true },
    )
    /**
     * Tells whether a run reuses what an earlier run recorded.
     *
     * @param first - Whether the earlier run had parallel units, or undefined
     *   when it left the setting out.
     * @param second - The same for this run.
     * @param incremental - Whether this run is incremental; false by default.
     * @returns Whether the evidence of `m1` is reused.
     */
    async function reusesAcross(
      first: undefined | boolean,
      second: undefined | boolean,
      incremental = false,
    ): Promise<boolean> {
      let { cache } = await prepare({}, { parallelUnits: first })
      let next = await prepare(
        {},
        {
          stored: { entries: cache!.entries, inputs: cache!.inputs },
          parallelUnits: second,
          incremental,
        },
      )
      return (
        next.cache!.lookupUnit(state.mutants.get('m1')!, file) === 'survived'
      )
    }

    await expect(reusesAcross(undefined, false)).resolves.toBe(true)
    await expect(reusesAcross(false, undefined)).resolves.toBe(true)
    await expect(reusesAcross(true, true)).resolves.toBe(true)
    await expect(reusesAcross(true, true, true)).resolves.toBe(true)
    await expect(reusesAcross(undefined, true)).resolves.toBe(false)
    await expect(reusesAcross(true, false)).resolves.toBe(false)
    await expect(reusesAcross(true, undefined, true)).resolves.toBe(false)
  })

  it.each([
    ['a test file', 'a.test.ts'],
    ['a file of the test runner', 'vitest.config.ts'],
    ['an env file', '.env.local'],
    ['a lockfile', 'pnpm-lock.yaml'],
    ['the lockfile npm installed by', 'node_modules/.package-lock.json'],
    ['the lockfile pnpm installed by', 'node_modules/.pnpm/lock.yaml'],
    ['the package file', 'package.json'],
    ['a tsconfig file', 'tsconfig.build.json'],
  ])('reuses nothing after a change of %s', async (_name, name) => {
    let { cache } = await prepare({})
    await writeFile(path.join(root, name), `changed ${name}`)

    await expect(reuses(cache!)).resolves.toBe(false)
  })

  it('reuses evidence after a change of a mutated file the test file read only in an incremental run', async () => {
    let file = path.join(root, 'a.test.ts')
    let source = path.join(root, 'src/a.ts')
    let helper = path.join(root, 'helper.ts')
    await mkdir(path.dirname(source), { recursive: true })
    await writeFile(source, 'let a = 1')
    await writeFile(helper, 'one')
    let world: Partial<FakeWorld> = {
      files: [{ dependencies: [file, source, helper], file }],
    }
    let { cache } = await prepare(world)
    await writeFile(source, 'let a = 2')

    await expect(reuses(cache!, world)).resolves.toBe(false)
    await expect(reuses(cache!, world, true)).resolves.toBe(true)

    await writeFile(helper, 'two')

    await expect(reuses(cache!, world, true)).resolves.toBe(false)
  })

  it('reuses evidence with extra inputs while their files are unchanged', async () => {
    let extra = path.join(root, 'extra.json')
    await writeFile(extra, 'one')
    let { cache } = await prepare({})
    let hash = createHash('sha256').update('one').digest('hex')
    let stored = {
      entries: new Map(
        [...cache!.entries].map(([slot, entry]) => [
          slot,
          { ...entry, inputs: 'i1' },
        ]),
      ),
      inputs: new Map([
        ['i1', { files: [['extra.json', hash]], environment: [] }],
      ]) as RunCache['inputs'],
    }

    await expect(reuses(stored)).resolves.toBe(true)

    await writeFile(extra, 'two')

    await expect(reuses(stored)).resolves.toBe(false)
  })

  it('keys a test file by the environment variables it read', async () => {
    let files = [{ file: path.join(root, 'a.test.ts'), environment: ['MODE'] }]
    let { cache } = await prepare({ files })
    /**
     * Builds the inputs of a run with a value of `MODE`.
     *
     * @param value - Hash of the value of `MODE`.
     * @returns Changes to the simulated project.
     */
    function withMode(value: string): Partial<FakeWorld> {
      return {
        cacheInputs: {
          files: [path.join(root, 'vitest.config.ts')],
          environment: { '': { MODE: value } },
          settings: {},
        },
        files,
      }
    }

    await expect(reuses(cache!, withMode('m1'))).resolves.toBe(true)
    await expect(reuses(cache!, withMode('m2'))).resolves.toBe(false)
  })

  it('gives no cache and no warning without cache inputs or test file dependencies', async () => {
    await expect(prepare({ cacheInputs: undefined })).resolves.toStrictEqual({
      warning: null,
      inputs: null,
      cache: null,
    })
    await expect(
      prepare({
        files: [{ file: path.join(root, 'a.test.ts'), dependencies: null }],
      }),
    ).resolves.toStrictEqual({
      inputs: createInputs(),
      warning: null,
      cache: null,
    })
  })

  it('gives no key to what depends on a device or a pipe, whose content is unknown, and no cache, with a warning, when every test file or a file of the environment does', async () => {
    let a = path.join(root, 'a.test.ts')
    let b = path.join(root, 'b.test.ts')
    await writeFile(b, 'test b')
    let tests = [
      { covers: ['m1'], id: 'a1', file: a },
      { covers: ['m1'], id: 'b1', file: b },
    ]
    let { cache } = await prepare({
      files: [
        { dependencies: ['/dev/null'], modified: ['/dev/null'], file: a },
        { dependencies: [], file: b },
      ],
      tests,
    })
    let device = skipped(
      `${path.relative(root, '/dev/null')} is a device, a pipe or a socket, so mootant cannot tell whether it changed.`,
    )

    let inputs = {
      files: [path.join(root, 'vitest.config.ts'), '/dev/null'],
      environment: { '': { MODE: 'm1' } },
      settings: {},
    }

    expect([...cache!.dependencies.values()]).toStrictEqual([[b]])
    await expect(
      prepare({ files: [{ dependencies: ['/dev/null'], file: a }] }),
    ).resolves.toStrictEqual({
      inputs: createInputs(),
      warning: device,
      cache: null,
    })
    await expect(prepare({ cacheInputs: inputs })).resolves.toStrictEqual({
      warning: device,
      cache: null,
      inputs,
    })
  })

  it('gives no key to what depends on a file changed during the run', async () => {
    let a = path.join(root, 'a.test.ts')
    let b = path.join(root, 'b.test.ts')
    let config = path.join(root, 'vitest.config.ts')
    let future = new Date(Date.now() + 10_000_000)
    let now = new Date()
    await writeFile(b, 'test b')
    await utimes(a, future, future)
    try {
      let { cache } = await prepare(
        {
          tests: [
            { covers: ['m1'], id: 'a1', file: a },
            { covers: ['m1'], id: 'b1', file: b },
          ],
        },
        { started: Date.now() + 1 },
      )

      expect([...cache!.dependencies.values()]).toStrictEqual([[b, b]])
      expect(cache!.environment).toContain(config)
      expect(cache!.entries.size).toBe(0)

      let modified = await prepare(
        { files: [{ dependencies: [a], modified: [a], file: a }] },
        { started: Date.now() + 1 },
      )

      expect([...modified.cache!.dependencies.values()]).toStrictEqual([[a, a]])
    } finally {
      await utimes(a, now, now)
    }
  })

  it('gives no cache, with a warning that names the file, when a file of the environment, or one that left every test file without a key, changed during the run', async () => {
    let a = path.join(root, 'a.test.ts')
    let b = path.join(root, 'b.test.ts')
    let config = path.join(root, 'vitest.config.ts')
    let helper = path.join(root, 'helper.ts')
    let future = new Date(Date.now() + 10_000_000)
    let now = new Date()
    let reason =
      'has a modification time at or after the start of the run, so it may have changed while the run went on.'
    await writeFile(helper, 'helper')
    await utimes(helper, future, future)
    try {
      await expect(
        prepare(
          {
            tests: [
              { covers: ['m1'], id: 'a1', file: a },
              { covers: ['m1'], id: 'b1', file: b },
            ],
            files: [
              { dependencies: [helper], file: a },
              { dependencies: null, file: b },
            ],
          },
          { started: Date.now() + 1 },
        ),
      ).resolves.toStrictEqual({
        warning: skipped(`helper.ts ${reason}`),
        inputs: createInputs(),
        cache: null,
      })

      await utimes(root, future, future)

      await expect(
        prepare(
          { files: [{ dependencies: [root], file: a }] },
          { started: Date.now() + 1 },
        ),
      ).resolves.toStrictEqual({
        warning: skipped(`the root of the project ${reason}`),
        inputs: createInputs(),
        cache: null,
      })

      await utimes(config, future, future)

      await expect(
        prepare({}, { started: Date.now() + 1 }),
      ).resolves.toStrictEqual({
        warning: skipped(`vitest.config.ts ${reason}`),
        inputs: createInputs(),
        cache: null,
      })
    } finally {
      await utimes(helper, now, now)
      await utimes(root, now, now)
      await utimes(config, now, now)
    }
  })

  it('keeps the cache of a run whose test code wrote a file of the environment back', async () => {
    let a = path.join(root, 'a.test.ts')
    let config = path.join(root, 'vitest.config.ts')
    let future = new Date(Date.now() + 10_000_000)
    let now = new Date()
    await utimes(config, future, future)
    try {
      let { warning, cache } = await prepare(
        { files: [{ dependencies: [config], modified: [config], file: a }] },
        { started: Date.now() + 1 },
      )

      expect(warning).toBeNull()
      expect([...cache!.dependencies.values()]).toStrictEqual([[a, config]])
      expect(cache!.environment).toContain(config)
    } finally {
      await utimes(config, now, now)
    }
  })
})
