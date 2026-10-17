import { describe, expect, it } from 'vitest'
import path from 'node:path'

import type { BuiltInAdapters } from '../../../types/adapter/built-in-adapters'
import type { TestAdapter } from '../../../types/adapter/test-adapter'
import type { MutantResult } from '../../../types/run/mutant-result'
import type { Diagnostic } from '../../../types/mutant/diagnostic'

import { runReferenceMutants } from '../../helpers/run-reference-mutants'
import { compareCodeUnits } from '../../../core/compare-code-units'
import { vitestAdapter } from '../../../adapters/vitest/index'
import { runMutants } from '../../../core/run-mutants'

/**
 * Root of the fixture project: one source file and one test file per risk of
 * the batch path; projects in subdirectories hold risks that need a project of
 * their own.
 */
let root = path.resolve(import.meta.dirname, '../../fixtures/equivalence')

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
 * Verdict of one mutant in each mode, reduced by `classify`.
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
  let builtIns = createBuiltIns(vitestAdapter())
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
      fast: classify(fastById.get(result.mutant.id)!),
      mutant: describeMutant(result),
      isolated: classify(result),
    })),
    original: reference.original,
    isolated,
    fast,
  }
}

/**
 * Creates a Vitest adapter whose dry runs use shorter watchdog budgets, so a
 * hang shows within seconds.
 *
 * @param timeouts - Budgets of the dry runs.
 * @param timeouts.file - Milliseconds for loading a test file and the work
 *   outside tries, before suite hook timeouts.
 * @param timeouts.test - Milliseconds for an attempt of a test, before its own
 *   timeout and the timeouts of its hooks.
 * @returns Adapter with the shortened dry runs.
 */
function createShortenedAdapter(timeouts: {
  file: number
  test: number
}): TestAdapter {
  let adapter = vitestAdapter()
  return {
    ...adapter,
    start: async context => {
      let session = await adapter.start(context)
      return {
        ...session,
        dryRun: request => session.dryRun({ ...request, timeouts }),
      }
    },
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
 * Reduces a verdict to whether the mutant was detected; a mutant no test
 * reached survives a plain run too.
 *
 * @param result - Verdict of a mutant.
 * @returns `killed`, `survived`, or the status itself when it is neither.
 */
function classify(result: MutantResult): string {
  if (result.status === 'Killed') {
    return 'killed'
  }
  if (result.status === 'Survived' || result.status === 'NoCoverage') {
    return 'survived'
  }
  return result.status
}

/**
 * Names a mutant for a readable comparison.
 *
 * @param result - Verdict of a mutant.
 * @returns File, mutator and replacement of the mutant.
 */
function describeMutant(result: MutantResult): string {
  return [
    result.mutant.file,
    result.mutant.mutator,
    result.mutant.replacement.replaceAll(/\s+/gu, ' '),
  ].join(' | ')
}

/**
 * Creates built-in adapters with the given Vitest adapter.
 *
 * @param adapter - Adapter `vitest` loads.
 * @returns Built-in adapters of a run.
 */
function createBuiltIns(adapter: TestAdapter): BuiltInAdapters {
  return {
    vitest: {
      load: () => Promise.resolve(adapter),
      detect: () => Promise.resolve(true),
    },
  }
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

describe('verdict equivalence', () => {
  it('agrees with mutants applied by hand in the default and fast modes', async () => {
    let { original, isolated, fast, rows } = await runAllPaths(root, sources)

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
      path.join(root, 'stale'),
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
      path.join(root, 'teardown'),
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
      path.join(root, 'environment'),
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
      builtIns: createBuiltIns(vitestAdapter()),
      cwd: path.join(root, 'stuck'),
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
        builtIns: createBuiltIns(vitestAdapter()),
        cwd: path.join(root, 'leaky'),
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
      path.join(root, 'concurrent'),
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
    let hang = path.join(root, 'hang')
    let shortened = createShortenedAdapter({ file: 5000, test: 300 })
    let reference = await runReferenceMutants(hang, [], {
      sources: ['src/flag.ts'],
    })

    expect(reference.original).toBe(true)
    await expect(
      runMutants({
        builtIns: createBuiltIns(shortened),
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
      builtIns: createBuiltIns(shortened),
      paths: ['src'],
      concurrency: 1,
      cache: false,
      cwd: hang,
    })

    expect(isolated.results.map(classify)).toStrictEqual(['killed'])
  }, 30_000)

  it('never runs a test file twice at once', async () => {
    // Every unit of the test file uses one fixed file, so two units that ran
    // at once would kill equivalent mutants or let a mutant survive.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(root, 'shared'),
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
        createShortenedAdapter({ file: 100, test: 100 }),
      ),
      cwd: path.join(root, 'slow'),
      paths: ['src'],
      concurrency: 1,
      cache: false,
    })

    expect(result.results.map(classify)).toStrictEqual(['killed'])
  }, 30_000)

  it('agrees with mutants applied by hand in Vue components and templates', async () => {
    // Scripts reach the Vue plugin in every form: inlined into the component
    // module, as the `?vue&type=script` request of a `tsx` script, and as an
    // external `<script src>` file. The card and the buttons are mounted in a
    // DOM, where their event handlers run.
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(root, 'vue'),
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
  }, 60_000)

  it('agrees with mutants applied by hand in Svelte components, templates and modules', async () => {
    let { original, isolated, fast, rows } = await runAllPaths(
      path.join(root, 'svelte'),
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

  it('gives Error to mutants that only a global setup runs', async () => {
    let result = await runMutants({
      builtIns: createBuiltIns(vitestAdapter()),
      cwd: path.join(root, 'global'),
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
})
