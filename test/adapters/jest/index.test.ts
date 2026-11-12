import {
  appendFile,
  writeFile,
  readFile,
  mkdtemp,
  mkdir,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DryRunResult } from '../../../types/adapter/dry-run-result'

import { createJestReferenceArguments } from '../../helpers/create-jest-reference-arguments'
import { createDryRunRequest } from '../../helpers/create-dry-run-request'
import { runJestBothWays } from '../../helpers/run-jest-both-ways'
import { runOnWorker } from '../../../adapters/jest/run-on-worker'
import { createJestScope } from '../../helpers/create-jest-scope'
import { getTestId } from '../../../adapters/shared/get-test-id'
import { createBuiltIns } from '../../helpers/create-built-ins'
import { shortenDryRuns } from '../../helpers/shorten-dry-runs'
import { getJestMajors } from '../../helpers/get-jest-majors'
import { jestAdapter } from '../../../adapters/jest/index'
import { runReference } from '../../helpers/run-reference'
import { runMutants } from '../../../core/run-mutants'
import { isAlive } from '../../helpers/is-alive'
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
 * Major versions of Jest of the rows that run on both, as `MOOTANT_TEST_JEST`
 * narrows them.
 */
let majors = getJestMajors()

/**
 * Copies of fixtures and sessions of the current test, which `cleanUp` ends.
 */
let {
  createCacheProject,
  clearVariables,
  createProject,
  directories,
  listForked,
  cleanUp,
  start,
} = createJestScope()

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
    let first = await session.dryRun(createDryRunRequest({ related }))

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
      createDryRunRequest({ instrumented: false, related }),
    )

    expect(second.files.map(file => file.covers)).toStrictEqual([[], [], []])
    expect(second.tests.map(item => item.tries[0]!.covers)).toStrictEqual([
      [],
      [],
      [],
      [],
    ])
    expect(second.served).toStrictEqual([])

    let third = await session.dryRun(createDryRunRequest({ related }))

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
      createDryRunRequest({
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
      session.dryRun(createDryRunRequest({ repeat: true })),
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
    let request = createDryRunRequest({
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
        args: createJestReferenceArguments(root),
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
        args: createJestReferenceArguments(root),
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

describe('jest workers', { timeout: 300_000 }, () => {
  beforeEach(clearVariables)

  afterEach(cleanUp)

  it('never runs a test file twice at once', async () => {
    // Every unit of the test file uses one fixed file and a lock, so two units
    // that ran at once would fail or lose their verdicts.
    let { original, result, rows } = await runJestBothWays(
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
      createDryRunRequest({ related: [path.join(root, 'src/title.js')] }),
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
      createDryRunRequest({ files: [{ project: 'quiet', file }] }),
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
      let { original, result, rows } = await runJestBothWays(root, {
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
    let { original, result, rows } = await runJestBothWays(
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
    let { original, result, rows } = await runJestBothWays(root, {
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
    let { original, result, rows } = await runJestBothWays(
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
