import {
  appendFile,
  writeFile,
  realpath,
  readFile,
  symlink,
  mkdtemp,
  utimes,
  mkdir,
  stat,
  cp,
  rm,
} from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { setTimeout } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { RunCacheFile } from '../../../types/cache/run-cache-file'
import type { MutantResult } from '../../../types/run/mutant-result'
import type { Diagnostic } from '../../../types/mutant/diagnostic'
import type { RunResult } from '../../../types/run/run-result'

import { getDrySnapshotPath } from '../../../core/cache/get-dry-snapshot-path'
import { getCachePath } from '../../../core/cache/get-cache-path'
import { createBuiltIns } from '../../helpers/create-built-ins'
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
 * Fixture project whose test computes a memoized Fibonacci number: a mutant
 * that drops the memo goes over the hit limit of its unit, and passes in the
 * confirmation with the raised limit.
 */
let hotFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/equivalence/hot',
)

/**
 * Fixture project whose test file covers `src/math.ts` with a value from
 * `virtual:limits`, a virtual module a plugin of `vitest.config.ts` builds from
 * `limits.json`, which it watches with `this.addWatchFile()`.
 */
let virtualFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-virtual',
)

/**
 * Fixture workspace whose project is `packages/app`: its test file covers
 * `src/math.ts` with a value it reads from `fixtures/limits.json` of the
 * workspace, outside the project root.
 */
let workspaceFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-workspace',
)

/**
 * Fixture project whose test file covers `src/math.ts` with values it reads in
 * a copy that `cp` makes in a directory of `mkdtemp`, following links: one
 * behind a link to `test/shared`, which the test makes, and one in a `.git`
 * directory, which the test makes too, as git keeps none in a fixture.
 */
let copiesFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-copies',
)

/**
 * Fixture project whose test file covers `src/math.ts` with a value from
 * `limits-pkg`, a package each test writes into the `node_modules` of its copy,
 * beside a `package-lock.json` that never changes.
 */
let dependencyFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-dependency',
)

/**
 * Fixture project whose test file covers `src/math.ts` and writes
 * `package.json` back as it read it.
 */
let packageFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-package',
)

/**
 * Fixture workspace of three projects with a shared root: the global setup of
 * project `a` provides the URL of a server on a random port, with a token of
 * the run, and its `define` holds the time the configuration loaded;
 * `test/a/url.test.ts` reads the URL, `test/a/stamp.test.ts` the time and
 * `test/a/plain.test.ts` neither. The `define` of project `b` holds the time
 * under a key with a dot, which `test/b/started.test.ts` reads, and on
 * `import.meta`, which `test/b/meta.test.ts` reads, while
 * `test/b/other.test.ts` reads only a URL its project never provides. Project
 * `c` provides a URL too, and its `define` of an environment variable holds
 * code that stores the URL in a global as Vitest evaluates it, which
 * `test/c/init.test.ts` reads.
 */
let volatileFixture = path.resolve(
  import.meta.dirname,
  '../../fixtures/cache-volatile',
)

/**
 * Environment variables the tests change, with their values before.
 */
let variables = Object.fromEntries(
  [
    'TERM_SESSION_ID',
    'MOOTANT_PROVIDE',
    'MOOTANT_TIMEOUT',
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
 * Writes `limits-pkg` into the `node_modules` of a copy of the dependency
 * fixture, as an install, `patch-package` or a hand edit leaves it, with the
 * age in its entry, in `limits.js`, which its entry imports or requires, or in
 * the file its manifest, or the nested one of `dist/esm`, names.
 *
 * @param root - Root of the copy.
 * @param shape - `entry` for an ES module package whose entry holds the age,
 *   `import` for one whose entry imports it, `require` for a CommonJS one whose
 *   entry requires it, `main` for an ES module package with a file for each
 *   age, whose `main` names the one of the age, `imports` for one whose entry
 *   in `dist/esm` imports `#limits`, which the `package.json` there maps to the
 *   file of the age.
 * @param age - Age from which the package counts a person as an adult.
 */
async function writeLimitsPackage(
  root: string,
  shape: 'require' | 'imports' | 'import' | 'entry' | 'main',
  age: number,
): Promise<void> {
  let directory = path.join(root, 'node_modules/limits-pkg')
  let limits = JSON.stringify({ age })
  let adults = {
    'adult-18.js': 'export default { "age": 18 }',
    'adult-30.js': 'export default { "age": 30 }',
  }
  let files = {
    imports: {
      'dist/esm/package.json': JSON.stringify({
        imports: { '#limits': `./adult-${age}.js` },
        type: 'module',
      }),
      'dist/esm/index.js': "export { default } from '#limits'",
      ...Object.fromEntries(
        Object.entries(adults).map(([name, text]) => [
          `dist/esm/${name}`,
          text,
        ]),
      ),
    },
    require: {
      'index.js': "module.exports = require('./limits.js')",
      'limits.js': `module.exports = ${limits}`,
    },
    import: {
      'index.js': "export { default } from './limits.js'",
      'limits.js': `export default ${limits}`,
    },
    entry: { 'index.js': `export default ${limits}` },
    main: adults,
  }
  let entries = {
    imports: 'dist/esm/index.js',
    main: `adult-${age}.js`,
    require: 'index.js',
    import: 'index.js',
    entry: 'index.js',
  }
  await mkdir(path.join(directory, 'dist/esm'), { recursive: true })
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      type: shape === 'require' ? 'commonjs' : 'module',
      main: entries[shape],
      name: 'limits-pkg',
    }),
  )
  let written = Object.entries(files[shape])
  await Promise.all(
    written.map(([name, text]) =>
      writeFile(path.join(directory, name), `${text}\n`),
    ),
  )
  /**
   * Files modified in the millisecond a run starts count as changed during it.
   */
  await setTimeout(5)
}

/**
 * Runs the mutants of the copy with Vitest and counts the isolated units.
 *
 * @param root - Root of the copy.
 * @param options - Fast mode, the cache setting and whether to replay.
 * @param options.fast - Whether to run in fast mode.
 * @param options.cache - Whether to use the cache; on when omitted.
 * @param options.replay - Whether the run may reuse the dry run an earlier run
 *   saved; otherwise a run with the cache removes that first, so it starts
 *   Vitest, as the rows that check the cache keys of fresh dry runs need.
 * @returns Result of the run and the isolated units it ran.
 */
async function run(
  root: string,
  options: { replay?: boolean; cache?: boolean; fast?: boolean } = {},
): Promise<{ result: RunResult; units: number }> {
  let { replay = false, ...settings } = options
  if (!replay && settings.cache !== false) {
    await rm(getDrySnapshotPath(root), { force: true })
  }
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
    ...settings,
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
  /**
   * Files modified in the millisecond a run starts count as changed during it.
   */
  await setTimeout(5)
  return root
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

  it('reuses every verdict of an unchanged project, without Vitest once it saved its dry run', async () => {
    let root = await copyFixture()
    let first = await run(root)
    let second = await run(root, { replay: true })
    let warm = await run(root)

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
    expect(second.result.runs).toStrictEqual({})
    expect(second.units).toBe(0)
    expect(warm.result.runs).toStrictEqual({ dry: 1 })
    expect(warm.result.results).toStrictEqual(second.result.results)
    expect(warm.result.diagnostics).toStrictEqual(second.result.diagnostics)
  }, 60_000)

  it('starts Vitest again once a variable its configuration reads changes', async () => {
    let root = await copyFixture()
    await writeFile(
      path.join(root, 'vitest.config.ts'),
      "export default {\n  test: {\n    testTimeout: Number(process.env['MOOTANT_TIMEOUT'] ?? 5000),\n    include: ['test/**/*.test.ts'],\n  },\n}\n",
    )
    await setTimeout(5)
    let first = await run(root)
    let replayed = await run(root, { replay: true })
    process.env['MOOTANT_TIMEOUT'] = '6000'
    let changed = await run(root, { replay: true })
    let again = await run(root, { replay: true })

    expect(first.result.diagnostics).toStrictEqual([])
    expect(replayed.result.runs).toStrictEqual({})
    expect(changed.result.runs).toMatchObject({ dry: 1 })
    expect(splitCached(changed.result)).toStrictEqual({
      ran: ['src/limit.ts', 'src/size.ts'],
      cached: [],
    })
    expect(again.result.runs).toStrictEqual({})
    expect(again.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      changed.result.results.map(summarizeCachedVerdict),
    )
  }, 90_000)

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
    /**
     * Their other test file loads the changed file, so only that unit runs.
     */
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

  it('runs without a cache, and names the file, while the configuration or a file every test file imports has a modification time at or after the start of the run', async () => {
    let root = await copyFixture()
    let config = path.join(root, 'vitest.config.ts')
    let future = new Date(Date.now() + 10_000_000)
    let past = new Date(Date.now() - 10_000_000)
    /**
     * Builds the warning of a run that a file left without a cache.
     *
     * @param file - Display path of the file.
     * @returns The warning.
     */
    function skipped(file: string): Diagnostic {
      return {
        message: `Verdicts were neither reused nor cached because ${file} has a modification time at or after the start of the run, so it may have changed while the run went on.`,
        code: 'cache-skipped',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      }
    }
    await utimes(config, future, future)
    let first = await run(root)
    let second = await run(root)
    await utimes(config, past, past)
    await utimes(path.join(root, 'src/size.ts'), future, future)
    let imported = await run(root)

    expect(
      [first, second, imported].map(({ result }) => result.cache),
    ).toStrictEqual([false, false, false])
    expect(first.result.diagnostics).toStrictEqual([
      skipped('vitest.config.ts'),
    ])
    expect(second.result.diagnostics).toStrictEqual([
      skipped('vitest.config.ts'),
    ])
    expect(imported.result.diagnostics).toStrictEqual([skipped('src/size.ts')])
    await expect(stat(getCachePath(root))).rejects.toThrow('ENOENT')
  }, 90_000)

  it('reuses the verdicts of tests that write the package file back as it was', async () => {
    let root = await copyFixture(packageFixture)
    let first = await run(root)
    let second = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(second.result.cache).toBe(true)
    expect(splitCached(second.result)).toStrictEqual({
      cached: ['src/math.ts'],
      ran: [],
    })
  }, 60_000)

  it('saves no verdicts, and names the package file, when tests change it again after the dry run', async () => {
    let root = await copyFixture(packageFixture)
    await writeFile(
      path.join(root, 'test/math.test.ts'),
      [
        "import { writeFileSync, readFileSync } from 'node:fs'",
        "import { fileURLToPath } from 'node:url'",
        "import { expect, it } from 'vitest'",
        '',
        "import { isAdult } from '../src/math'",
        '',
        "let file = fileURLToPath(new URL('../package.json', import.meta.url))",
        '',
        "it('tells adults, and adds a space to the package file', () => {",
        "  writeFileSync(file, readFileSync(file, 'utf8') + ' ')",
        '  expect(isAdult(30)).toBe(true)',
        '  expect(isAdult(5)).toBe(false)',
        '})',
        '',
      ].join('\n'),
    )
    await setTimeout(5)
    let { result } = await run(root)

    expect(result.diagnostics).toStrictEqual([
      {
        message:
          'Verdicts were not cached because package.json changed during the run.',
        code: 'cache-skipped',
        severity: 'warning',
        column: null,
        file: null,
        line: null,
      },
    ])
    await expect(stat(getCachePath(root))).rejects.toThrow('ENOENT')
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

  it('runs mutants again after a change of a file a plugin watches for a virtual module', async () => {
    let root = await copyFixture(virtualFixture)
    await run(root)
    let unchanged = await run(root)

    expect(unchanged.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: ['src/math.ts'],
      ran: [],
    })
    await writeFile(path.join(root, 'limits.json'), '{ "age": 18 }\n')
    await setTimeout(5)
    let changed = await run(root)
    let again = await run(root)
    let fresh = await run(root, { cache: false })

    expect(splitCached(changed.result)).toStrictEqual({
      ran: ['src/math.ts'],
      cached: [],
    })
    expect(changed.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      fresh.result.results.map(summarizeCachedVerdict),
    )
    expect(
      changed.result.results.map(summarizeCachedVerdict),
    ).not.toStrictEqual(unchanged.result.results.map(summarizeCachedVerdict))
    expect(splitCached(again.result)).toStrictEqual({
      cached: ['src/math.ts'],
      ran: [],
    })
  }, 60_000)

  it.each([
    ['an ES module package edited in place', 'entry', false],
    [
      'an ES module package edited in place, with the dry run saved',
      'entry',
      true,
    ],
    ['a file an ES module package imports itself', 'import', false],
    ['a file a CommonJS package requires itself', 'require', false],
    [
      'the entry the manifest of an ES module package names, with the dry run saved',
      'main',
      true,
    ],
    [
      'the file a nested package.json maps an import of the package to, with the dry run saved',
      'imports',
      true,
    ],
  ] as const)(
    'runs mutants again after a change of %s, as the lockfile stays the same',
    async (_name, shape, replay) => {
      let root = await copyFixture(dependencyFixture)
      await writeLimitsPackage(root, shape, 30)
      let first = await run(root)
      let unchanged = await run(root, { replay })

      expect(first.result.diagnostics).toStrictEqual([])
      expect(unchanged.result.results.every(entry => entry.cached)).toBe(true)
      expect(unchanged.result.runs).toStrictEqual(replay ? {} : { dry: 1 })

      await writeLimitsPackage(root, shape, 18)
      let changed = await run(root, { replay })
      let fresh = await run(root, { cache: false })

      expect(splitCached(changed.result)).toStrictEqual({
        ran: ['src/math.ts'],
        cached: [],
      })
      expect(changed.result.results.map(summarizeCachedVerdict)).toStrictEqual(
        fresh.result.results.map(summarizeCachedVerdict),
      )
      expect(
        changed.result.results.map(entry => [
          entry.mutant.replacement,
          entry.status,
        ]),
      ).toStrictEqual([
        ['age > 18', 'Killed'],
        ['age == 18', 'Survived'],
        ['age >= 17', 'Survived'],
      ])
    },
    120_000,
  )

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

  it('caches no timeout of a mutant that only makes code hotter, whose confirmation passes', async () => {
    let root = await copyFixture(hotFixture)
    let first = await run(root)
    let stored = JSON.parse(
      await readFile(getCachePath(root), 'utf8'),
    ) as RunCacheFile
    let second = await run(root, { replay: true })

    expect(first.result.diagnostics).toStrictEqual([])
    expect(first.result.runs).toStrictEqual({ isolated: 2, dry: 1 })
    expect(
      first.result.results
        .filter(entry => entry.status === 'Survived')
        .map(entry => entry.mutant.replacement),
    ).toStrictEqual(['false', ';'])
    expect(
      Object.values(stored.entries).map(entry => entry.status),
    ).not.toContain('Timeout')
    expect(second.result.runs).toStrictEqual({})
    expect(second.result.results.map(summarizeCachedVerdict)).toStrictEqual(
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
    /**
     * A unit of the changed file per mutant, and the confirmation of the one
     * that went over the hit limit there.
     */
    expect(cached.units).toBe(3)

    let replayed = await run(root, { replay: true })

    expect(replayed.result.runs).toStrictEqual({})
    expect(
      replayed.result.results.map(entry => [
        entry.status,
        entry.cause,
        entry.cached,
      ]),
    ).toStrictEqual(
      fresh.result.results.map(entry => [entry.status, entry.cause, true]),
    )
    expect(
      replayed.result.results.filter(entry => entry.status === 'Timeout'),
    ).toMatchObject([{ cause: 'hit-limit' }])
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

    /**
     * The `if (flag)` → `if (false)` mutants load `lib/extra.*`; the first is
     * in `pickImport`, the second in `pickRequire`.
     */
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

  it('runs mutants again after a change of a file of the workspace that tests read outside the root', async () => {
    let workspace = await copyFixture(workspaceFixture)
    await writeFile(
      path.join(workspace, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\n",
    )
    await setTimeout(5)
    let root = path.join(workspace, 'packages/app')
    let first = await run(root)
    let unchanged = await run(root)

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(unchanged.result)).toStrictEqual({
      cached: ['src/math.ts'],
      ran: [],
    })
    expect(unchanged.units).toBe(0)

    await writeFile(
      path.join(workspace, 'fixtures/limits.json'),
      '{ "age": 18 }\n',
    )
    await setTimeout(5)
    let changed = await run(root)
    let fresh = await run(root, { cache: false })

    expect(splitCached(changed.result)).toStrictEqual({
      ran: ['src/math.ts'],
      cached: [],
    })
    expect(changed.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      fresh.result.results.map(summarizeCachedVerdict),
    )
    expect(
      changed.result.results.map(entry => [
        entry.mutant.replacement,
        entry.status,
      ]),
    ).toStrictEqual([
      ['age > 18', 'Killed'],
      ['age == 18', 'Survived'],
      ['age >= 17', 'Survived'],
    ])

    let again = await run(root)

    expect(splitCached(again.result)).toStrictEqual({
      cached: ['src/math.ts'],
      ran: [],
    })
    expect(again.units).toBe(0)
    expect(again.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      fresh.result.results.map(summarizeCachedVerdict),
    )
  }, 120_000)

  it('runs mutants again after a change of what tests read in a copy cp made through a link or of a .git directory, which its walk of the source leaves out', async () => {
    let root = await copyFixture(copiesFixture)
    await mkdir(path.join(root, 'test/fx/.git'), { recursive: true })
    await writeFile(path.join(root, 'test/fx/.git/HEAD'), '30\n')
    await symlink('../shared', path.join(root, 'test/fx/link'))
    await setTimeout(5)
    await run(root)
    await writeFile(path.join(root, 'test/shared/limits.txt'), '18\n')
    await setTimeout(5)
    let linked = await run(root)
    let linkedFresh = await run(root, { cache: false })
    await writeFile(path.join(root, 'test/fx/.git/HEAD'), '18\n')
    await setTimeout(5)
    let head = await run(root)
    let headFresh = await run(root, { cache: false })

    expect(linked.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      linkedFresh.result.results.map(summarizeCachedVerdict),
    )
    expect(head.result.results.map(summarizeCachedVerdict)).toStrictEqual(
      headFresh.result.results.map(summarizeCachedVerdict),
    )
    expect(
      [linked, head].map(({ result }) =>
        result.results.map(entry => [entry.mutant.replacement, entry.status]),
      ),
    ).toStrictEqual([
      [
        ['age > 18', 'Killed'],
        ['age == 18', 'Killed'],
        ['age >= 17', 'Survived'],
      ],
      [
        ['age > 18', 'Killed'],
        ['age == 18', 'Survived'],
        ['age >= 17', 'Survived'],
      ],
    ])
  }, 180_000)

  it('keeps the cache of tests with side effects true to what they read', async () => {
    let root = await copyFixture(effectsFixture)
    let all = [
      'src/child.ts',
      'src/config.ts',
      'src/copy.ts',
      'src/golden.ts',
      'src/listing.ts',
    ]
    let readers = ['src/child.ts', 'src/config.ts', 'src/listing.ts']
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

    expect(splitCached(define.result).ran).toStrictEqual(readers)

    process.env['MOOTANT_PROVIDE'] = 'q'
    let provide = await run(root)

    expect(splitCached(provide.result).ran).toStrictEqual(readers)
    expect(provide.result.diagnostics).toStrictEqual([])
  }, 180_000)

  it('runs again only the test files that read a value of provide or define that changed, in their own project', async () => {
    let root = await copyFixture(volatileFixture)
    let all = [
      'src/code.ts',
      'src/meta.ts',
      'src/other.ts',
      'src/plain.ts',
      'src/stamp.ts',
      'src/started.ts',
      'src/url.ts',
    ]
    let first = await run(root)
    let second = await run(root)
    let replayed = await run(root, { replay: true })

    expect(first.result.diagnostics).toStrictEqual([])
    expect(splitCached(first.result)).toStrictEqual({ cached: [], ran: all })
    expect(splitCached(second.result)).toStrictEqual({
      ran: [
        'src/code.ts',
        'src/meta.ts',
        'src/stamp.ts',
        'src/started.ts',
        'src/url.ts',
      ],
      cached: ['src/other.ts', 'src/plain.ts'],
    })
    expect(second.result.diagnostics).toStrictEqual([])
    expect(replayed.result.runs).toStrictEqual({})
    expect(splitCached(replayed.result)).toStrictEqual({ cached: all, ran: [] })
  }, 120_000)

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
