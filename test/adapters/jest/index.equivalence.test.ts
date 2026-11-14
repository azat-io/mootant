import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import type { MutantResult } from '../../../types/run/mutant-result'

import { createJestReferenceArguments } from '../../helpers/create-jest-reference-arguments'
import { runJestBothWays } from '../../helpers/run-jest-both-ways'
import { createJestScope } from '../../helpers/create-jest-scope'
import { describeMutant } from '../../helpers/describe-mutant'
import { getJestMajors } from '../../helpers/get-jest-majors'
import { jestAdapter } from '../../../adapters/jest/index'
import { runReference } from '../../helpers/run-reference'
import { findResult } from '../../helpers/find-result'
import { isAlive } from '../../helpers/is-alive'

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
 * The mutant that loops through a site and never yields.
 */
const ENDLESS = 'src/settle.js | missing-await | pending.promise'

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
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = getJestMajors()

/**
 * Copies of fixtures and sessions of the current test, which `cleanUp` ends.
 */
let { clearVariables, createProject, listForked, cleanUp } = createJestScope()

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

describe.each(majors)('jest verdict equivalence on Jest %i', major => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('agrees with mutants applied by hand', { timeout: 600_000 }, async () => {
    let root = await createProject('basic', major)
    let { original, result, rows } = await runJestBothWays(root)
    let compared = rows.filter(row => !OWN_TIMEOUT.includes(row.mutant))
    let late = rows.find(row => row.mutant === LATE_REJECTION)!
    let endless = result.results.find(
      entry => describeMutant(entry) === ENDLESS,
    )!

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
        ENDLESS,
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
      // Its confirmation allows far more evaluations, which code in the vm of
      // Jest may not make within the doubled time, so the watchdog may stop it.
      `${ENDLESS} | Timeout | ${endless.cause === 'hang' ? 'hang' : 'hit-limit'} | -`,
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
    'lets the tests decide mutants that only make code hotter, as plain Jest does',
    { timeout: 120_000 },
    async () => {
      // Without the memo, the test evaluates mutant sites about two million
      // times, over the hit limit of its unit. In the vm of Jest that takes a
      // few hundred milliseconds, though plain Jest passes it in time.
      let { original, result, rows } = await runJestBothWays(
        await createProject('hot', major),
      )

      expect(original).toBe(true)
      expect(result.diagnostics).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(
        rows.filter(row => row.reference === 'survived').map(row => row.mutant),
      ).toStrictEqual([
        'src/fib.js | condition | false',
        'src/fib.js | statement-removal | ;',
      ])
      expect(result.runs).toStrictEqual({ isolated: 2, dry: 1 })
    },
  )

  it(
    'agrees with mutants applied by hand in ES modules',
    { timeout: 600_000 },
    async () => {
      let { original, result, rows } = await runJestBothWays(
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
      let { original, result, rows } = await runJestBothWays(
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

      await expect(runJestBothWays(root, TYPED)).rejects.toThrow(
        /^Tests fail without mutants; fix them first \(1 test file\):\n {2}typed\/area\.test\.ts: fails to load: /u,
      )

      let plain = await runReference(root, [], {
        args: [...createJestReferenceArguments(root), ...TYPED.jestFlags],
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
      let { original, result, rows } = await runJestBothWays(root, {
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
