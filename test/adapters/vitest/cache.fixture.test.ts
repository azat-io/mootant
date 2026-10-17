import {
  appendFile,
  writeFile,
  realpath,
  readFile,
  symlink,
  mkdtemp,
  mkdir,
  cp,
  rm,
} from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { MutantResult } from '../../../types/run/mutant-result'
import type { RunResult } from '../../../types/run/run-result'

import { vitestAdapter } from '../../../adapters/vitest/index'
import { runMutants } from '../../../core/run-mutants'

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
    builtIns: {
      vitest: {
        load: () => Promise.resolve(vitestAdapter()),
        detect: () => Promise.resolve(true),
      },
    },
    onProgress: event => {
      if (event.kind === 'run-start' && event.run === 'isolated') {
        units += event.units
      }
    },
    paths: ['src'],
    concurrency: 2,
    cwd: root,
    ...options,
  })
  return { result, units }
}

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
function summarize(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.replacement,
    result.status,
    result.path ?? '-',
    result.killedBy ?? '-',
  ].join(' | ')
}

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
    expect(second.result.results.map(summarize)).toStrictEqual(
      first.result.results.map(summarize),
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

    expect(second.result.results.map(summarize)).toStrictEqual(
      first.result.results.map(summarize),
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
    let file = path.join(root, 'node_modules/.cache/mootant/run-v1.json')
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
    expect(second.result.results.map(summarize)).toStrictEqual(
      first.result.results.map(summarize),
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
