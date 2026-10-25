import {
  writeFile,
  realpath,
  mkdtemp,
  utimes,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { FileMutants } from '../../../types/mutant/file-mutants'
import type { StoredCache } from '../../../types/cache/stored-cache'
import type { FakeWorld } from '../../helpers/create-fake-adapter'
import type { RunCache } from '../../../types/cache/run-cache'

import { createTestRun, TEST_LIMITS } from '../../helpers/create-test-run'
import { prepareRunCache } from '../../../core/cache/prepare-run-cache'

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Prepares the cache of a run over a simulated project whose test file covers
 * `m1`, and records that `m1` survived it.
 *
 * @param world - Changes to the simulated project.
 * @param stored - Entries and inputs of the cache file.
 * @param run - How the run goes.
 * @param run.started - Start of the run; by default no file changed during it.
 * @param run.incremental - Whether the run is incremental; false by default.
 * @returns Cache of the run, the state's mutant `m1` and its test file key.
 */
async function prepare(
  world: Partial<FakeWorld> = {},
  stored: StoredCache = { entries: new Map(), inputs: new Map() },
  run: { incremental?: boolean; started?: number } = {},
): Promise<RunCache | null> {
  let { started = Number.POSITIVE_INFINITY, incremental = false } = run
  let file = path.join(root, 'a.test.ts')
  let { session, state, fake } = await createTestRun(
    {
      cacheInputs: {
        files: [path.join(root, 'vitest.config.ts')],
        environment: { '': { MODE: 'm1' } },
        settings: {},
      },
      tests: [{ covers: ['m1'], id: 'a1', file }],
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
  let cache = await prepareRunCache({
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
    stored: Promise.resolve(stored),
    analysis: state.analysis,
    adapter: fake.adapter,
    limits: TEST_LIMITS,
    incremental,
    session,
    started,
    now: 1,
    root,
    dry,
  })
  cache?.recordUnit(state.mutants.get('m1')!, file, {
    inputs: {
      dependencies: [file],
      environment: [],
    },
    verdict: 'survived',
  })
  return cache
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
  let second = await prepare(
    world,
    { entries: first.entries, inputs: first.inputs },
    { incremental },
  )
  return second!.lookupUnit(state.mutants.get('m1')!, file) === 'survived'
}

describe('prepareRunCache', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-prep-')))
    await writeFile(path.join(root, 'a.test.ts'), 'test')
    await writeFile(path.join(root, 'vitest.config.ts'), 'config')
    await writeFile(path.join(root, 'tsconfig.json'), '{}')
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reuses evidence while nothing changed', async () => {
    let first = await prepare()

    expect(first!.entries.size).toBe(1)
    await expect(reuses(first!)).resolves.toBe(true)
    await expect(
      prepare({
        cacheInputs: {
          files: [path.join(root, 'vitest.config.ts')],
          settings: {},
        },
      }),
    ).resolves.not.toBeNull()
    await expect(
      prepare({
        onDry: result => ({
          ...result,
          files: result.files.map(({ environment, ...file }) => file),
        }),
      }),
    ).resolves.not.toBeNull()
  })

  it.each([
    ['a test file', 'a.test.ts'],
    ['a file of the test runner', 'vitest.config.ts'],
    ['an env file', '.env.local'],
    ['a lockfile', 'pnpm-lock.yaml'],
    ['the package file', 'package.json'],
    ['a tsconfig file', 'tsconfig.build.json'],
  ])('reuses nothing after a change of %s', async (_name, name) => {
    let first = await prepare()
    await writeFile(path.join(root, name), `changed ${name}`)

    await expect(reuses(first!)).resolves.toBe(false)
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
    let first = await prepare(world)
    await writeFile(source, 'let a = 2')

    await expect(reuses(first!, world)).resolves.toBe(false)
    await expect(reuses(first!, world, true)).resolves.toBe(true)

    await writeFile(helper, 'two')

    await expect(reuses(first!, world, true)).resolves.toBe(false)
  })

  it('reuses evidence with extra inputs while their files are unchanged', async () => {
    let extra = path.join(root, 'extra.json')
    await writeFile(extra, 'one')
    let first = await prepare()
    let hash = createHash('sha256').update('one').digest('hex')
    let stored = {
      entries: new Map(
        [...first!.entries].map(([slot, entry]) => [
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
    let first = await prepare({ files })
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

    await expect(reuses(first!, withMode('m1'))).resolves.toBe(true)
    await expect(reuses(first!, withMode('m2'))).resolves.toBe(false)
  })

  it('gives no cache without cache inputs or test file dependencies', async () => {
    await expect(prepare({ cacheInputs: undefined })).resolves.toBeNull()
    await expect(
      prepare({
        files: [{ file: path.join(root, 'a.test.ts'), dependencies: null }],
      }),
    ).resolves.toBeNull()
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
      let cache = await prepare(
        {
          tests: [
            { covers: ['m1'], id: 'a1', file: a },
            { covers: ['m1'], id: 'b1', file: b },
          ],
        },
        undefined,
        { started: Date.now() + 1 },
      )

      expect([...cache!.dependencies.values()]).toStrictEqual([[b, b]])
      expect(cache!.environment).toContain(config)
      expect(cache!.entries.size).toBe(0)

      let modified = await prepare(
        { files: [{ dependencies: [a], modified: [a], file: a }] },
        undefined,
        { started: Date.now() + 1 },
      )

      expect([...modified!.dependencies.values()]).toStrictEqual([[a, a]])

      await utimes(config, future, future)

      await expect(
        prepare({}, undefined, { started: Date.now() + 1 }),
      ).resolves.toBeNull()
    } finally {
      await utimes(a, now, now)
      await utimes(config, now, now)
    }
  })
})
