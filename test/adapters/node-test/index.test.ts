import {
  beforeAll,
  afterEach,
  describe,
  afterAll,
  expect,
  it,
  vi,
} from 'vitest'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import type { AdapterSession } from '../../../types/adapter/adapter-session'
import type { MutantResult } from '../../../types/run/mutant-result'
import type { RunEvent } from '../../../types/run/run-event'

import { startNodeTestSession } from '../../../adapters/node-test/start-node-test-session'
import { createWorkDirectory } from '../../../core/run/create-work-directory'
import { buildNodeTestPreload } from '../../helpers/build-node-test-preload'
import { runNodeTestReference } from '../../helpers/run-node-test-reference'
import { nodeTestAdapter } from '../../../adapters/node-test/index'
import { classifyVerdict } from '../../helpers/classify-verdict'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { shortenDryRuns } from '../../helpers/shorten-dry-runs'
import { describeMutant } from '../../helpers/describe-mutant'
import { listMutants } from '../../../core/list-mutants'
import { runMutants } from '../../../core/run-mutants'
import { version } from '../../../package.json'

/**
 * Path of the built preload, set before the first test.
 */
let preload = vi.hoisted(() => ({ path: '' }))

vi.mock(import('../../../adapters/node-test/get-preload-path'), () => ({
  getPreloadPath: () => preload.path,
}))

vi.mock(
  import('../../../adapters/node-test/start-node-test-session'),
  async importOriginal => {
    let actual = await importOriginal()
    return { startNodeTestSession: vi.fn(actual.startNodeTestSession) }
  },
)

/**
 * Root of the fixture projects.
 */
let fixtures = path.resolve(import.meta.dirname, '../../fixtures/node-test')

/**
 * Node binary of the test processes: `MOOTANT_TEST_NODE` when set, such as an
 * older Node in CI, else the one running the tests.
 */
let node = process.env['MOOTANT_TEST_NODE'] ?? process.execPath

/**
 * Major and minor version of that Node binary.
 */
let [major = 0, minor = 0] = execFileSync(
  node,
  ['-p', 'process.versions.node'],
  { encoding: 'utf8' },
)
  .split('.')
  .map(Number)

/**
 * Verdict of one mutant in mootant's run and by hand.
 */
interface Row {
  /**
   * Verdict of the mutant applied by hand.
   */
  reference: string

  /**
   * Verdict of mootant's run, reduced by `classifyVerdict`.
   */
  verdict: string

  /**
   * File, mutator and replacement of the mutant.
   */
  mutant: string
}

/**
 * Runs the mutants of a fixture project with mootant and by hand, where each
 * source file `src/<name>.<ext>` is reached only by `test/<name>.test.<ext>`.
 *
 * @param root - Root of the fixture project.
 * @param options - How both runs start.
 * @param options.command - Test command of mootant's run.
 * @param options.args - Arguments of `node` in the reference, before the test
 *   file.
 * @param options.extension - Extension of the test files.
 * @param options.fast - Whether mootant's run asks for fast mode.
 * @returns Mootant's run, its progress events, whether the untouched copy
 *   passed, and a row per mutant.
 */
async function runBothWays(
  root: string,
  options: {
    extension: string
    command?: string
    fast?: boolean
    args: string[]
  },
): Promise<{
  result: Awaited<ReturnType<typeof runMutants>>
  events: RunEvent[]
  original: boolean
  rows: Row[]
}> {
  let events: RunEvent[] = []
  let result = await runMutants({
    builtIns: createBuiltIns(
      'node-test',
      nodeTestAdapter({ command: options.command, node }),
    ),
    onProgress: event => {
      events.push(event)
    },
    fast: options.fast,
    paths: ['src'],
    concurrency: 2,
    cache: false,
    cwd: root,
  })
  let reference = await runNodeTestReference(
    root,
    result.results.map(entry => entry.mutant),
    {
      testFiles: file => [
        `test/${path.basename(file, path.extname(file))}.test${options.extension}`,
      ],
      args: options.args,
      timeout: 4000,
      node,
    },
  )
  return {
    rows: result.results.map(entry => ({
      reference: reference.verdicts.get(entry.mutant.id)!,
      verdict: classifyVerdict(entry),
      mutant: describeMutant(entry),
    })),
    original: reference.original,
    result,
    events,
  }
}

/**
 * Lists the cause, status and test path of the mutants with the given
 * descriptions.
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

describe('nodeTestAdapter', () => {
  afterEach(() => {
    vi.mocked(startNodeTestSession).mockReset()
  })

  it('creates the node-test adapter without batch mode', async () => {
    vi.mocked(startNodeTestSession).mockResolvedValue({} as AdapterSession)
    let adapter = nodeTestAdapter({ command: 'bnt' })
    let context = {
      workDirectory: '/w',
      concurrency: null,
      files: [],
      root: '/',
    }
    await adapter.start(context)

    expect(adapter).toMatchObject({ name: 'node-test', batch: false, version })
    expect(startNodeTestSession).toHaveBeenCalledWith(context, {
      command: 'bnt',
    })

    await nodeTestAdapter().start(context)

    expect(vi.mocked(startNodeTestSession).mock.calls[1]![1]).toStrictEqual({})
  })
})

describe('node-test adapter', () => {
  let built: Awaited<ReturnType<typeof buildNodeTestPreload>>

  beforeAll(async () => {
    built = await buildNodeTestPreload()
    preload.path = built.path
  })

  afterAll(async () => {
    await built.remove()
  })

  it('reports the tests of the files that load related modules, and their output', async () => {
    let root = path.join(fixtures, 'basic')
    let work = await createWorkDirectory()
    let output: { file: string | null; text: string }[] = []
    let session = await nodeTestAdapter({ node }).start({
      onOutput: (text, file) => {
        output.push({ file, text })
      },
      workDirectory: work.path,
      concurrency: 2,
      files: [],
      root,
    })
    try {
      let math = path.join(root, 'test/math.test.js')

      expect(session.version).toBe(
        execFileSync(node, ['-p', 'process.versions.node'], {
          encoding: 'utf8',
        }).trim(),
      )
      expect(session.workers).toBe(2)
      expect(session.diagnostics).toStrictEqual([])
      await expect(session.listTestFiles()).resolves.toContain(math)

      // The first dry run runs every test file, and reports those that loaded
      // a related module.
      let dry = await session.dryRun({
        related: ['fraction', 'math', 'range', 'track'].map(name =>
          path.join(root, `src/${name}.js`),
        ),
        timeouts: { file: 60_000, test: 60_000 },
        instrumented: true,
        repeat: false,
        files: null,
      })

      expect(
        dry.files.map(file => [
          path.relative(root, file.file),
          file.concurrent,
          file.loadFailed,
        ]),
      ).toStrictEqual([
        ['test/fraction.test.js', false, false],
        ['test/math.test.js', false, false],
        ['test/range.test.js', false, false],
        ['test/track.test.js', true, false],
      ])
      // Subtests are part of the test around them, and a failing todo test
      // does not fail.
      expect(
        dry.tests.map(test => [
          path.basename(test.file),
          test.name,
          test.tries.map(entry => entry.failed),
        ]),
      ).toStrictEqual([
        ['fraction.test.js', 'halves', [false]],
        ['fraction.test.js', 'rounds thirds', [false]],
        ['fraction.test.js', 'divides by three', [false]],
        ['fraction.test.js', 'halves again', [false]],
        ['math.test.js', 'adds', [false]],
        ['math.test.js', 'tells positive numbers', [false]],
        ['math.test.js', 'gives the sign', [false]],
        ['range.test.js', 'clamp > keeps values in range', [false]],
        ['track.test.js', 'tracked tasks > first', [false]],
        ['track.test.js', 'tracked tasks > second', [false]],
        ['track.test.js', 'ran both at once', [false]],
      ])
      expect(
        output
          .filter(entry => entry.file === math)
          .map(entry => entry.text)
          .join(''),
      ).toContain('gives the sign')
      expect(output.every(entry => entry.file?.endsWith('.test.js'))).toBe(true)
    } finally {
      await session.close()
      await work.remove()
    }
  }, 60_000)

  it('stops on a test file that fails to load without mutants', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns('node-test', nodeTestAdapter({ node })),
        cwd: path.join(fixtures, 'broken'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests fail without mutants; fix them first (1 test file):\n  test/parse.test.js: fails to load: Missing fixture data',
    )
  }, 30_000)

  it('stops on a test that hangs without mutants and names it', async () => {
    await expect(
      runMutants({
        builtIns: createBuiltIns(
          'node-test',
          shortenDryRuns(nodeTestAdapter({ node }), { file: 3000, test: 500 }),
        ),
        cwd: path.join(fixtures, 'stuck'),
        paths: ['src'],
        concurrency: 1,
        cache: false,
      }),
    ).rejects.toThrow(
      'Tests hang without mutants: "waits forever" in test/wait.test.js',
    )
  }, 30_000)
})

describe('node:test verdict equivalence', () => {
  let built: Awaited<ReturnType<typeof buildNodeTestPreload>>

  beforeAll(async () => {
    built = await buildNodeTestPreload()
    preload.path = built.path
  })

  afterAll(async () => {
    await built.remove()
  })

  it('agrees with mutants applied by hand', async () => {
    let { original, result, rows } = await runBothWays(
      path.join(fixtures, 'basic'),
      { args: ['--test'], extension: '.js' },
    )

    expect(original).toBe(true)
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'Timeout', 'killed']),
    )
    // Only units that hung are reported. Some Node versions end a process
    // whose test waits on a promise nothing settles, so only the loop of
    // `pause` hangs on every version.
    expect(result.diagnostics.map(diagnostic => diagnostic.code)).toStrictEqual(
      result.diagnostics.map(() => 'worker-hang'),
    )
    expect(result.diagnostics.map(diagnostic => diagnostic.file)).toContain(
      'test/pause.test.js',
    )
    expect(result.mode).toBe('isolated')
    expect(
      result.results
        .filter(entry => entry.status === 'Survived')
        .every(entry => entry.path === 'isolated'),
    ).toBe(true)
    expect(
      pick(result.results, [
        // A later test sees the state the mutant left, never reaching it.
        'src/counter.js | assignment-operator | count -= 1',
        // Only the suite's `after` hook sees what `register` returns, which
        // its `before` hook reached first; `size` fails the test.
        'src/registry.js | return-value | 0',
        // The root `afterEach` of the test file fails.
        'src/ledger.js | assignment-operator | balance -= amount',
        // The listener fails after the test returned.
        "src/announce.js | string-literal | ''",
        // The test process kills itself.
        'src/guard.js | condition | true',
        // The module throws while it loads.
        'src/schema.js | comparison-operator | true',
        // Module-level code, reached before the first test.
        'src/limits.js | arithmetic-operator | 2 / 5',
        // The second caller loops without awaiting.
        'src/queue.js | missing-await | busy',
        // The test loops without reaching the mutant.
        'src/pause.js | boolean-literal | true',
        // A failing todo test does not fail the run.
        'src/fraction.js | arithmetic-operator | value * 3',
        // The root `after` hook of the test file fails.
        'src/tally.js | arithmetic-operator | value / 2',
        // A failing todo test explains the failing exit code.
        'src/status.js | comparison-operator | value != 10',
        // Only a test that `only` would leave out fails.
        'src/solo.js | arithmetic-operator | value / 3',
        // Only todo tests that a helper module declares fail.
        'src/backlog.js | arithmetic-operator | points / 2',
        // The test after them fails too.
        'src/backlog.js | number-literal | 3',
        // Tests of a todo suite and subtests of a todo test fail, which fails
        // the run where Node does not mark them todo too.
        'src/backlog.js | arithmetic-operator | points * people',
        // A test that marks itself todo under the mutant fails, in a file
        // whose dry run had no todo test.
        'src/deferral.js | comparison-operator | true',
        // Todo tests throw after they returned, and node:test gives the
        // errors to them.
        'src/drift.js | comparison-operator | value != 10',
        // A suite `before` hook fails next to a failing todo test.
        'src/gate.js | comparison-operator | false',
      ]),
    ).toStrictEqual([
      "src/announce.js | string-literal | '' | Killed | stray-error | -",
      'src/backlog.js | arithmetic-operator | points / 2 | Survived | - | -',
      'src/backlog.js | number-literal | 3 | Killed | assertion | -',
      (
        rows.find(
          row =>
            row.mutant ===
            'src/backlog.js | arithmetic-operator | points * people',
        )!.reference === 'killed'
      ) ?
        'src/backlog.js | arithmetic-operator | points * people | Killed | assertion | -'
      : 'src/backlog.js | arithmetic-operator | points * people | Survived | - | -',
      'src/counter.js | assignment-operator | count -= 1 | Killed | assertion | -',
      'src/deferral.js | comparison-operator | true | Survived | - | -',
      'src/drift.js | comparison-operator | value != 10 | Survived | - | -',
      'src/fraction.js | arithmetic-operator | value * 3 | Survived | - | -',
      'src/gate.js | comparison-operator | false | Killed | hook-error | static',
      'src/guard.js | condition | true | Killed | crash | -',
      'src/ledger.js | assignment-operator | balance -= amount | Killed | assertion | -',
      'src/limits.js | arithmetic-operator | 2 / 5 | Killed | assertion | static',
      'src/pause.js | boolean-literal | true | Timeout | hang | static',
      'src/queue.js | missing-await | busy | Timeout | hit-limit | -',
      // Node 22 passes a run whose suite `after` hook fails.
      major === 22 ?
        'src/registry.js | return-value | 0 | Survived | - | static'
      : 'src/registry.js | return-value | 0 | Killed | hook-error | static',
      'src/registry.js | return-value | 0 | Killed | assertion | -',
      'src/schema.js | comparison-operator | true | Killed | load-error | static',
      'src/solo.js | arithmetic-operator | value / 3 | Killed | assertion | -',
      'src/status.js | comparison-operator | value != 10 | Survived | - | -',
      'src/tally.js | arithmetic-operator | value / 2 | Killed | hook-error | -',
    ])
  }, 120_000)

  it('never runs a test file twice at once', async () => {
    // Every unit of the test file uses one fixed file, so two units that ran
    // at once would kill equivalent mutants.
    let { original, result, rows } = await runBothWays(
      path.join(fixtures, 'shared'),
      { args: ['--test'], extension: '.js' },
    )

    expect(original).toBe(true)
    expect(result.diagnostics).toStrictEqual([])
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(
      rows.filter(row =>
        [
          'src/render.js | comparison-operator | count != 1',
          'src/render.js | arithmetic-operator | count / 2',
        ].includes(row.mutant),
      ),
    ).toStrictEqual([
      expect.objectContaining({ reference: 'killed' }),
      expect.objectContaining({ reference: 'survived' }),
    ])
  }, 60_000)

  it('agrees with mutants applied by hand in TypeScript, and runs fast mode as the default', async () => {
    // Node 20 has no type stripping, so the tests load through tsx there,
    // found from this repository, since the copies of the reference have no
    // dependencies.
    let flags =
      major >= 22 ?
        ['--experimental-strip-types']
      : ['--import', import.meta.resolve('tsx')]
    let options = {
      command: ['node', '--test', ...flags, 'test/format.test.ts'].join(' '),
      args: ['--test', ...flags],
      extension: '.ts',
    }
    let root = path.join(fixtures, 'typescript')
    let isolated = await runBothWays(root, options)
    let fast = await runBothWays(root, { ...options, fast: true })

    expect(isolated.original).toBe(true)
    expect(isolated.result.diagnostics).toStrictEqual([])
    expect(isolated.rows).toStrictEqual(
      isolated.rows.map(row => ({ ...row, verdict: row.reference })),
    )
    expect(new Set(isolated.rows.map(row => row.reference))).toStrictEqual(
      new Set(['survived', 'killed']),
    )
    expect(fast.rows).toStrictEqual(isolated.rows)
    expect(fast.result.mode).toBe('isolated')
    expect(fast.events.filter(event => event.kind === 'note')).toStrictEqual([
      {
        message:
          'node-test has no batch mode, so fast mode runs every mutant isolated, as a run without --fast does.',
        kind: 'note',
      },
    ])
  }, 60_000)

  it.skipIf(major < 22 || (major === 22 && minor < 13))(
    'agrees with mutants applied by hand in snapshot tests',
    async () => {
      let { original, result, rows } = await runBothWays(
        path.join(fixtures, 'snapshot'),
        { args: ['--test'], extension: '.js' },
      )

      expect(original).toBe(true)
      expect(result.diagnostics).toStrictEqual([])
      expect(rows).toStrictEqual(
        rows.map(row => ({ ...row, verdict: row.reference })),
      )
      expect(new Set(rows.map(row => row.reference))).toStrictEqual(
        new Set(['survived', 'killed']),
      )
    },
    60_000,
  )

  it('skips only the message mutants of logging calls and runs the rest as by hand', async () => {
    let directory = path.join(fixtures, 'logging')
    let { original, result, rows } = await runBothWays(directory, {
      args: ['--test'],
      extension: '.js',
    })
    let listing = await listMutants({
      paths: ['src'],
      cwd: directory,
      skipped: true,
    })
    let { skipped, source } = listing.files[0]!

    expect(original).toBe(true)
    expect(rows).toStrictEqual(
      rows.map(row => ({ ...row, verdict: row.reference })),
    )
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
      result.results.map(entry => [
        source!.slice(entry.mutant.start, entry.mutant.end),
        entry.mutant.replacement,
        entry.status,
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
