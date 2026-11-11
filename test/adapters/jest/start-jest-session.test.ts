import type { ChildProcess } from 'node:child_process'

import {
  writeFile,
  readFile,
  symlink,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync, fork } from 'node:child_process'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestAdapterOptions } from '../../../adapters/jest/types/jest-adapter-options'
import type { AdapterContext } from '../../../types/adapter/adapter-context'
import type { DryRunRequest } from '../../../types/adapter/dry-run-request'
import type { JestHost } from '../../../adapters/jest/types/jest-host'

import { writeWorkerSession } from '../../../adapters/jest/write-worker-session'
import { startJestSession } from '../../../adapters/jest/start-jest-session'
import { createWorkerPool } from '../../../adapters/jest/create-worker-pool'
import { hashEnvironment } from '../../../adapters/shared/hash-environment'
import { startJestHost } from '../../../adapters/jest/start-jest-host'
import { createJestProject } from '../../helpers/create-jest-project'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, fork: vi.fn(actual.fork) as typeof actual.fork }
})

vi.mock(
  import('../../../adapters/jest/start-jest-host'),
  async importOriginal => {
    let actual = await importOriginal()
    return { startJestHost: vi.fn(actual.startJestHost) }
  },
)

vi.mock(
  import('../../../adapters/jest/create-worker-pool'),
  async importOriginal => {
    let actual = await importOriginal()
    return { createWorkerPool: vi.fn(actual.createWorkerPool) }
  },
)

vi.mock(
  import('../../../adapters/jest/write-worker-session'),
  async importOriginal => {
    let actual = await importOriginal()
    return { writeWorkerSession: vi.fn(actual.writeWorkerSession) }
  },
)

/**
 * Directories of the current test, removed after it.
 */
let directories: string[] = []

/**
 * Output of the session of the current test.
 */
let output: string[] = []

/**
 * Sessions of the current test, closed after it.
 */
let closes: (() => Promise<unknown>)[] = []

/**
 * Starts a session on a project, closing it after the test.
 *
 * @param root - Root of the project.
 * @param options - Options of the adapter.
 * @param context - What differs from the default context.
 * @returns The session.
 */
async function start(
  root: string,
  options: JestAdapterOptions = {},
  context: Partial<AdapterContext> = {},
): ReturnType<typeof startJestSession> {
  let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
  directories.push(workDirectory)
  let session = await startJestSession(
    {
      onOutput: text => {
        output.push(text)
      },
      concurrency: null,
      workDirectory,
      files: [],
      root,
      ...context,
    },
    options,
  )
  closes.push(session.close)
  return session
}

/**
 * Copies the fixture for the current test.
 *
 * @param major - Major version of Jest.
 * @returns Root of the copy.
 */
async function createProject(major: 29 | 30 = 30): Promise<string> {
  let root = await createJestProject('start', major)
  directories.push(root)
  return root
}

/**
 * Reads the host of the last session started.
 *
 * @returns What `startJestHost` resolved with.
 */
function readHost(): Promise<JestHost> {
  return vi.mocked(startJestHost).mock.results.at(-1)!
    .value as Promise<JestHost>
}

/**
 * Tells whether a process lives.
 *
 * @param pid - Its id.
 * @returns Whether a signal can reach it.
 */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Reads the process id of the last host started.
 *
 * @returns Its id.
 */
function readHostPid(): number {
  return (vi.mocked(fork).mock.results.at(-1)!.value as ChildProcess).pid!
}

describe('startJestSession', { timeout: 60_000 }, () => {
  beforeEach(() => {
    for (let name of Object.keys(process.env)) {
      if (/^(?:NODE_OPTIONS$|NODE_PATH$|TEST$|VITEST)/u.test(name)) {
        vi.stubEnv(name, undefined)
      }
    }
  })

  afterEach(async () => {
    await Promise.all(closes.map(close => close()))
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    await Promise.all(
      directories.map(directory =>
        rm(directory, { recursive: true, force: true }),
      ),
    )
    closes = []
    directories = []
    output = []
    vi.mocked(fork).mockClear()
    vi.mocked(startJestHost).mockClear()
    vi.mocked(createWorkerPool).mockClear()
  })

  describe.each([
    { version: /^29\.7\./u, major: 29 as const },
    { major: 30 as const, version: /^30\./u },
  ])('on Jest $major', ({ version, major }) => {
    it('starts a host with global setup done and closes it with global teardown', async () => {
      let root = await createProject(major)
      await mkdir(path.join(root, '__mocks__'))
      await writeFile(path.join(root, '__mocks__/fake.js'), '')
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      let session = await start(root, {}, { workDirectory })
      let pid = readHostPid()
      let host = await readHost()

      expect(session.version).toMatch(version)
      expect(session.workers).toBe(3)
      expect(session.diagnostics).toStrictEqual([])
      expect(host.ready.env['SET_BY_GLOBAL_SETUP']).toBe('yes')
      expect(host.ready.cwd).toBe(root)
      expect(isAlive(pid)).toBe(true)

      let cache = path.join(root, 'node_modules/.cache/mootant/jest')
      let saved = JSON.parse(
        await readFile(path.join(workDirectory, 'jest/session.json'), 'utf8'),
      ) as {
        globalConfig: Record<string, unknown>
        packages: { version: string }
        projects: unknown[]
      }

      expect(saved.packages.version).toMatch(version)
      expect(saved.globalConfig).toMatchObject({
        changedFilesWithAncestor: false,
        onlyChanged: false,
        maxWorkers: 3,
        watch: false,
        ci: true,
        seed: 1,
      })
      expect(saved.projects).toHaveLength(1)
      expect(existsSync(cache)).toBe(true)
      expect(saved.projects[0]).toMatchObject({
        moduleMap: {
          mocks: [['fake', '__mocks__/fake.js']],
          rootDir: root,
        },
        config: { cacheDirectory: cache, rootDir: root },
      })
      await expect(session.listTestFiles()).resolves.toStrictEqual([
        path.join(root, '__mocks__/fake.js'),
        path.join(root, 'global-setup.js'),
        path.join(root, 'global-teardown.js'),
        path.join(root, 'test/add.test.js'),
      ])
      expect(existsSync(path.join(root, 'teardown-ran'))).toBe(false)

      let closed = session.close()

      expect(session.close()).toBe(closed)
      await expect(closed).resolves.toStrictEqual([])
      expect(existsSync(path.join(root, 'teardown-ran'))).toBe(true)
      expect(isAlive(pid)).toBe(false)
    })

    it('fails the run as it closes on a snapshot file whose test file is gone, as plain Jest does, and names it', async () => {
      let root = await createProject(major)
      await mkdir(path.join(root, 'test/__snapshots__'), { recursive: true })
      await writeFile(
        path.join(root, 'test/__snapshots__/gone.test.js.snap'),
        '// Jest Snapshot v1, https://jestjs.io/docs/snapshot-testing\n',
      )
      let session = await start(root)

      await expect(session.close()).resolves.toStrictEqual([
        {
          message:
            'Jest found snapshot files whose test file is gone, which fails a plain run of Jest too: test/__snapshots__/gone.test.js.snap; remove them, or run jest -u.',
          code: 'teardown-failed',
          severity: 'error',
          column: null,
          file: null,
          line: null,
        },
      ])
    })

    it('tells as it closes that global teardown failed, with what Jest wrote', async () => {
      let root = await createProject(major)
      await writeFile(
        path.join(root, 'global-teardown.js'),
        "module.exports = () => {\n  throw new Error('the database is gone')\n}\n",
      )
      let session = await start(root)

      await expect(session.close()).resolves.toStrictEqual([
        expect.objectContaining({
          message: expect.stringMatching(
            /^Jest exited with code 1 in global teardown or the test sequencer, which fails a plain run of Jest too; its last output:\n[\s\S]*the database is gone/u,
          ) as string,
          code: 'teardown-failed',
          severity: 'error',
        }) as object,
      ])
    })

    it('knows what every verdict depends on beyond what a test file reads once global setup ran, and tells workers what reads count', async () => {
      let root = await createProject(major)
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      let session = await start(
        root,
        { env: { FROM_OPTIONS: '1' } },
        { workDirectory },
      )
      let inputs = await session.cacheInputs!()
      let host = await readHost()
      let saved = JSON.parse(
        await readFile(path.join(workDirectory, 'jest/session.json'), 'utf8'),
      ) as {
        projects: { config: { moduleFileExtensions: string[] } }[]
        reads: { directories: string[]; extensions: string[] }
      }

      expect(inputs.files).toStrictEqual(
        expect.arrayContaining([
          path.join(root, 'global-teardown.js'),
          path.join(root, 'global-setup.js'),
          path.join(root, 'jest.config.js'),
          path.join(root, 'package.json'),
        ]) as string[],
      )
      expect(
        inputs.files.filter(
          file =>
            file.includes('/node_modules/') || file.includes('mootant-work-'),
        ),
      ).toStrictEqual([])
      expect(inputs.environment).toStrictEqual({
        '': hashEnvironment(host.ready.env),
      })
      expect(host.ready.env['SET_BY_GLOBAL_SETUP']).toBe('yes')
      expect(inputs.settings).toMatchObject({
        projects: [{ config: { rootDir: '<root>' }, console: 'stream' }],
        env: { FROM_OPTIONS: '1' },
        jest: session.version,
      })
      expect(saved.reads).toStrictEqual({
        extensions: [...saved.projects[0]!.config.moduleFileExtensions, 'snap'],
        directories: [root],
      })
    })

    it('beats what a configuration sets about which tests run and coverage', async () => {
      let root = await createProject(major)
      await writeFile(
        path.join(root, 'jest.config.js'),
        `module.exports = {
          changedFilesWithAncestor: true,
          testEnvironment: 'node',
          collectCoverage: true,
          onlyFailures: true,
          onlyChanged: true,
          lastCommit: true,
          watchAll: true,
          watch: true,
        }`,
      )
      let workDirectory = await mkdtemp(path.join(tmpdir(), 'mootant-work-'))
      directories.push(workDirectory)
      await start(root, {}, { workDirectory })
      let saved = JSON.parse(
        await readFile(path.join(workDirectory, 'jest/session.json'), 'utf8'),
      ) as { globalConfig: Record<string, unknown> }

      expect(saved.globalConfig).toMatchObject({
        changedFilesWithAncestor: false,
        collectCoverage: false,
        onlyFailures: false,
        onlyChanged: false,
        lastCommit: false,
        watchAll: false,
        watch: false,
      })
    })

    it('keeps its runner away from the transformer of the project', async () => {
      let root = await createProject(major)
      await writeFile(
        path.join(root, 'refuse.js'),
        `module.exports = {
          process(code, file) {
            if (!file.startsWith(__dirname)) {
              throw new Error('not a file of the project: ' + file)
            }
            return { code }
          },
        }`,
      )
      await writeFile(
        path.join(root, 'jest.config.js'),
        `module.exports = {
          transform: { '.*': '<rootDir>/refuse.js' },
          testEnvironment: 'node',
        }`,
      )

      await expect(start(root)).resolves.toMatchObject({
        version: expect.stringMatching(version),
      })
    })

    it('gives tests the console of plain Jest, which writes at once in a run of one test file, unless the command says no', async () => {
      let root = await createProject(major)
      let file = path.join(root, 'test/add.test.js')
      await writeFile(
        file,
        `test('writes to standard output as it logs', () => {
          let write = jest.spyOn(process.stdout, 'write')
          console.log('logged')
          expect(write).toHaveBeenCalled()
        })`,
      )
      let request: DryRunRequest = {
        timeouts: { file: 60_000, test: 60_000 },
        files: [{ project: '', file }],
        instrumented: false,
        repeat: false,
        related: [],
      }
      let loud = await start(root)
      let quiet = await start(root, { command: 'jest --verbose=false' })

      await expect(loud.dryRun(request)).resolves.toMatchObject({
        tests: [{ tries: [{ failed: false }] }],
      })
      await expect(quiet.dryRun(request)).resolves.toMatchObject({
        tests: [{ tries: [{ failed: true }] }],
      })
    })

    it('rejects a project without tests with the sentence, as with --passWithNoTests, and leaves no process', async () => {
      let root = await createProject(major)
      await rm(path.join(root, 'test'), { recursive: true })

      await expect(start(root)).rejects.toThrow(
        new Error(
          `Jest found no test files in ${root}; add a test or fix the Jest configuration.`,
        ),
      )
      expect(isAlive(readHostPid())).toBe(false)
    })
  })

  describe('on Jest 30', () => {
    it('gives Jest the variables of the process, the command and the options, without those of mootant', async () => {
      vi.stubEnv('FROM_PROCESS', 'process')
      vi.stubEnv('MOOTANT_UNIT', 'process')
      vi.stubEnv('IN_TWO', 'process')
      vi.stubEnv('IN_ALL', 'process')
      let root = await createProject()
      await start(root, {
        env: {
          FROM_OPTIONS: 'options',
          MOOTANT_PLAN: 'options',
          IN_ALL: 'options',
        },
        command:
          'FROM_COMMAND=command MOOTANT_OUT=command IN_TWO=command IN_ALL=command jest',
      })
      let { ready } = await readHost()

      expect(ready.env).toMatchObject({
        FROM_COMMAND: 'command',
        FROM_OPTIONS: 'options',
        FROM_PROCESS: 'process',
        IN_TWO: 'command',
        IN_ALL: 'options',
      })
      expect(
        Object.keys(ready.env).filter(name => name.startsWith('MOOTANT_')),
      ).toStrictEqual([])
    })

    it('takes the concurrency of the context over the workers of Jest, with no one to read the output', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'global-setup.js'),
        `module.exports = () => { console.log('no one reads this') }`,
      )
      let session = await start(
        root,
        {},
        { onOutput: undefined, concurrency: 2 },
      )

      expect(session.workers).toBe(2)
      expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(2)
    })

    it.each(['jest -i', 'jest --runInBand', 'jest --maxWorkers=4'])(
      'replaces what `%s` says of workers with the concurrency, for global setup too',
      async command => {
        let root = await createProject()
        await writeFile(
          path.join(root, 'global-setup.js'),
          `module.exports = globalConfig => {
            console.log('workers', globalConfig.maxWorkers)
          }`,
        )
        let session = await start(root, { command }, { concurrency: 2 })

        expect(session.workers).toBe(2)
        expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(2)
        expect(output.join('')).toContain('workers 2')
      },
    )

    it('takes the one worker of -i for the pool without a concurrency', async () => {
      let root = await createProject()
      let session = await start(root, { command: 'jest -i' })

      expect(session.workers).toBe(1)
      expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(1)
    })

    it('takes the workers of Jest for the pool without a concurrency', async () => {
      let root = await createProject()
      let session = await start(root, { command: 'jest --maxWorkers=4' })

      expect(session.workers).toBe(4)
      expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(4)
    })

    describe('what keeps test files from running at once', () => {
      /**
       * Starts a session on a project whose global setup says how many workers
       * Jest resolved.
       *
       * @param input - What differs.
       * @param input.command - Test command.
       * @param input.key - Whether its configuration sets `detectOpenHandles`.
       * @param input.concurrency - Most test files at once.
       * @returns The session.
       */
      async function startSerial(input: {
        concurrency: number | null
        command: string
        key?: boolean
      }): ReturnType<typeof startJestSession> {
        let root = await createProject()
        await writeFile(
          path.join(root, 'global-setup.js'),
          `module.exports = globalConfig => {
            console.log('workers', globalConfig.maxWorkers)
          }`,
        )
        await writeFile(
          path.join(root, 'jest.config.js'),
          `module.exports = {
            globalSetup: '<rootDir>/global-setup.js',
            detectOpenHandles: ${input.key ?? false},
            testEnvironment: 'node',
          }`,
        )
        return start(
          root,
          { command: input.command },
          { concurrency: input.concurrency },
        )
      }

      /**
       * Gives the warning for what a concurrency overrides.
       *
       * @param name - The flag or key.
       * @returns The sentence.
       */
      function createMessage(name: string): string {
        return `--concurrency overrides ${name}, which keeps test files from running at once; tests that rely on it can fail or read as kills.`
      }

      it.each([
        ['the flag', 'jest --detectOpenHandles --maxWorkers=4', false],
        ['the flag in kebab case', 'jest --detect-open-handles -w 4', false],
        ['the key', 'jest --maxWorkers=4', true],
      ])(
        'reads %s of open handles as -i with no concurrency, for global setup and with no word',
        async (_name, command, key) => {
          let session = await startSerial({
            concurrency: null,
            command,
            key,
          })

          expect(session.workers).toBe(1)
          expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(1)
          expect(output.join('')).toContain('workers 1')
          expect(session.diagnostics).toStrictEqual([])
        },
      )

      it('leaves the workers of Jest alone when the flag says no to the key', async () => {
        let session = await startSerial({
          command: 'jest --maxWorkers=4 --no-detectOpenHandles',
          concurrency: null,
          key: true,
        })

        expect(session.workers).toBe(4)
      })

      it.each([
        { command: 'jest -i', named: '-i', name: '-i', key: false },
        {
          command: 'jest --runInBand',
          named: '--runInBand',
          name: '--runInBand',
          key: false,
        },
        {
          command: 'jest --detectOpenHandles',
          named: 'detectOpenHandles',
          name: 'the flag',
          key: false,
        },
        {
          named: 'detectOpenHandles',
          name: 'the key',
          command: 'jest',
          key: true,
        },
        {
          name: '-i and the key together',
          command: 'jest -i',
          named: '-i',
          key: true,
        },
      ])(
        'lets a concurrency win over $name, with one warning',
        async ({ command, named, key }) => {
          let session = await startSerial({ concurrency: 2, command, key })

          expect(session.workers).toBe(2)
          expect(vi.mocked(createWorkerPool).mock.lastCall![0].size).toBe(2)
          expect(output.join('')).toContain('workers 2')
          expect(session.diagnostics).toStrictEqual([
            {
              message: createMessage(named),
              code: 'config-overridden',
              severity: 'warning',
              column: null,
              line: null,
              file: null,
            },
          ])
        },
      )

      it.each([
        ['-i', 'jest -i', false],
        ['the flag', 'jest --detectOpenHandles', false],
        ['the key', 'jest', true],
      ])(
        'says nothing of %s at a concurrency of one, as no two files overlap then',
        async (_name, command, key) => {
          let session = await startSerial({ concurrency: 1, command, key })

          expect(session.workers).toBe(1)
          expect(session.diagnostics).toStrictEqual([])
        },
      )

      it('says nothing of workers a script sets with no concurrency, and of what asks for no such thing', async () => {
        let session = await startSerial({
          command: 'jest --maxWorkers=1 --no-runInBand',
          concurrency: 2,
        })

        expect(session.workers).toBe(2)
        expect(session.diagnostics).toStrictEqual([])
      })
    })

    it('carries the mask of new files a global setup left to its workers', async () => {
      let root = await createProject()
      let file = path.join(root, 'test/add.test.js')
      await writeFile(
        path.join(root, 'global-setup.js'),
        `module.exports = () => { process.umask(0o027) }`,
      )
      await writeFile(
        file,
        `test('sees the mask of the setup', () => {
          expect(process.umask()).toBe(0o027)
        })`,
      )
      let session = await start(root)
      let dry = await session.dryRun({
        timeouts: { file: 60_000, test: 60_000 },
        files: [{ project: '', file }],
        instrumented: false,
        repeat: false,
        related: [],
      })

      expect(dry.tests.map(test => test.tries[0]!.message)).toStrictEqual([
        null,
      ])
    })

    describe('the heap limit of workers', () => {
      /**
       * Reads the heap limit V8 gives a plain Node process here with the 300 MB
       * the projects below ask for, as the young generation it adds to them
       * differs by platform.
       *
       * @returns The limit in bytes.
       */
      function readProjectLimit(): number {
        return Number(
          execFileSync(
            process.execPath,
            [
              '--max-old-space-size=300',
              '-p',
              "require('node:v8').getHeapStatistics().heap_size_limit",
            ],
            { encoding: 'utf8' },
          ),
        )
      }

      /**
       * Writes a test that adds the heap limit of its process to a file.
       *
       * @param root - Where the project is.
       * @returns The test file and the file it adds to.
       */
      async function writeLimitTest(
        root: string,
      ): Promise<{ limits: string; file: string }> {
        let file = path.join(root, 'test/add.test.js')
        let limits = path.join(root, 'limits')
        await writeFile(
          file,
          `test('writes its limit', () => {
            let limit = require('node:v8').getHeapStatistics().heap_size_limit
            require('node:fs').appendFileSync(${JSON.stringify(limits)}, limit + ',')
          })`,
        )
        return { limits, file }
      }

      /**
       * Builds a dry-run request for one test file.
       *
       * @param file - Path of what it runs.
       * @returns A request with long budgets.
       */
      function createRequest(file: string): DryRunRequest {
        return {
          timeouts: { file: 60_000, test: 60_000 },
          files: [{ project: '', file }],
          instrumented: false,
          repeat: false,
          related: [],
        }
      }

      it('rises for the next worker after one ran out of memory', async () => {
        let root = await createProject()
        let { limits, file } = await writeLimitTest(root)
        let dying = path.join(root, 'test/dying.test.js')
        await writeFile(
          dying,
          String.raw`test('dies as V8 does', () => {
            require('node:fs').writeSync(2, 'JavaScript heap out of memory\n')
            process.kill(process.pid, 'SIGABRT')
            return new Promise(() => {})
          })`,
        )
        let session = await start(root, {}, { concurrency: 1 })
        await session.dryRun(createRequest(file))
        await session.dryRun(createRequest(dying))
        await session.dryRun(createRequest(file))
        let [before, after] = (await readFile(limits, 'utf8'))
          .split(',')
          .map(Number)

        expect(after).toBeGreaterThan(before!)
      })

      it('stays the limit of the project, given in the options', async () => {
        let root = await createProject()
        let { limits, file } = await writeLimitTest(root)
        let session = await start(root, {
          env: { NODE_OPTIONS: '--max-old-space-size=300' },
        })
        await session.dryRun(createRequest(file))

        expect(Number.parseInt(await readFile(limits, 'utf8'), 10)).toBe(
          readProjectLimit(),
        )
      })

      it('stays the limit of the project, given in the command', async () => {
        let root = await createProject()
        let { limits, file } = await writeLimitTest(root)
        let session = await start(root, {
          command:
            'node --max-old-space-size=300 node_modules/jest/bin/jest.js',
        })
        await session.dryRun(createRequest(file))

        expect(Number.parseInt(await readFile(limits, 'utf8'), 10)).toBe(
          readProjectLimit(),
        )
      })
    })

    it('has no batch mode', async () => {
      let root = await createProject()
      let session = await start(root)

      await expect(session.runBatch({} as never)).rejects.toThrow(
        'The jest adapter has no batch mode.',
      )
    })

    it('runs isolated units on a worker, and rejects the running and the later ones with the error of a host that died', async () => {
      let root = await createProject()
      let file = path.join(root, 'test/add.test.js')
      let marker = path.join(root, 'sleeping')
      let plan = {
        units: [
          {
            limits: { timeout: 60_000, hitLimit: 1000 },
            project: '',
            mutant: 'm',
            file,
          },
        ],
      }
      let session = await start(root)

      await expect(session.runIsolated(plan)).resolves.toMatchObject({
        units: [{ incomplete: null, reached: false, unit: 0 }],
      })

      await writeFile(
        file,
        `test('sleeps', () => {
          require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120000)
        })`,
      )
      let running = session.runIsolated(plan)

      await expect
        .poll(() => existsSync(marker), { timeout: 30_000 })
        .toBe(true)

      let [forked, worker] = vi.mocked(fork).mock.results
      let host = await readHost()
      process.kill((forked!.value as ChildProcess).pid!, 'SIGKILL')
      let error = await host.died

      await expect(running).rejects.toBe(error)
      await expect
        .poll(() => isAlive((worker!.value as ChildProcess).pid!), {
          timeout: 10_000,
        })
        .toBe(false)
      await expect(session.runIsolated(plan)).rejects.toBe(error)
    })

    it('holds on to no result of a run that ended, as long as the host lives', async () => {
      setFlagsFromString('--expose-gc')
      let collect = runInNewContext('gc') as () => void
      let root = await createProject()
      let session = await start(root)
      let result = new WeakRef(
        await session.runIsolated({
          units: [
            {
              limits: { timeout: 60_000, hitLimit: 1000 },
              file: path.join(root, 'test/add.test.js'),
              project: '',
              mutant: 'm',
            },
          ],
        }),
      )
      await new Promise(resolve => {
        setImmediate(resolve)
      })
      collect()

      expect(result.deref()).toBeUndefined()
    })

    it('runs a dry run on a worker with the environment and the working directory of the host, and the flags of the command', async () => {
      let root = await createProject()
      let file = path.join(root, 'test/add.test.js')
      let moved = path.join(root, 'test')
      await writeFile(
        path.join(root, 'global-setup.js'),
        `module.exports = () => {
          process.env.SET_BY_GLOBAL_SETUP = 'yes'
          process.chdir(${JSON.stringify(moved)})
        }`,
      )
      await writeFile(
        file,
        `test('reads what the worker got', () => {
          console.log('written by the test')
          expect(process.env.SET_BY_GLOBAL_SETUP).toBe('yes')
          expect(process.env.FROM_OPTIONS).toBe('options')
          expect(process.env.TEMPLATE).toBe('$HOME')
          expect(process.execArgv).toEqual(['--stack-size=500'])
          expect(process.cwd()).toBe(${JSON.stringify(moved)})
        })`,
      )
      let chunks: [string, string | null][] = []
      let session = await start(
        root,
        {
          command:
            "TEMPLATE='$HOME' node --stack-size=500 node_modules/jest/bin/jest.js",
          env: { FROM_OPTIONS: 'options' },
        },
        {
          onOutput: (text, from) => {
            chunks.push([text, from])
          },
        },
      )
      let dry = await session.dryRun({
        timeouts: { file: 60_000, test: 60_000 },
        files: [{ project: '', file }],
        instrumented: false,
        repeat: false,
        related: [],
      })

      expect(dry.tests.map(test => test.tries[0]!.message)).toStrictEqual([
        null,
      ])
      expect(
        chunks
          .filter(([, from]) => from === file)
          .map(([text]) => text)
          .join(''),
      ).toContain('written by the test')
    })

    it('caps the first attempt of a dry run, and not its recheck', async () => {
      let root = await createProject()
      let file = path.join(root, 'test/add.test.js')
      let limits = path.join(root, 'limits')
      await writeFile(
        file,
        `test('writes its limit, and ends the process', () => {
          let limit = require('node:v8').getHeapStatistics().heap_size_limit
          require('node:fs').appendFileSync(${JSON.stringify(limits)}, limit + ',')
          process.exit(3)
        })`,
      )
      let session = await start(root)
      await session.dryRun({
        timeouts: { file: 60_000, test: 60_000 },
        files: [{ project: '', file }],
        instrumented: false,
        repeat: false,
        related: [],
      })
      let [capped, clean] = (await readFile(limits, 'utf8'))
        .split(',')
        .map(Number)

      expect(clean).toBeGreaterThan(capped!)
    })

    it('rejects every later dry run with the error of a host that died, and no rejection goes unhandled', async () => {
      let unhandled = vi.fn<(reason: unknown) => void>()
      process.on('unhandledRejection', unhandled)
      try {
        let root = await createProject()
        let session = await start(root)
        let host = await readHost()
        process.kill(readHostPid(), 'SIGKILL')
        let error = await host.died
        await new Promise(resolve => {
          setImmediate(resolve)
        })
        let request = {
          timeouts: { file: 60_000, test: 60_000 },
          instrumented: false,
          repeat: false,
          files: null,
          related: [],
        }

        await expect(session.dryRun(request)).rejects.toBe(error)
        await expect(session.dryRun({ ...request, repeat: true })).rejects.toBe(
          error,
        )
        await new Promise(resolve => {
          setImmediate(resolve)
        })

        expect(unhandled).not.toHaveBeenCalled()
      } finally {
        process.off('unhandledRejection', unhandled)
      }
    })

    it('gives a dry run that starts while the workers stop the error of the host', async () => {
      let root = await createProject()
      let session = await start(root)
      let request = {
        files: [{ file: path.join(root, 'test/add.test.js'), project: '' }],
        timeouts: { file: 60_000, test: 60_000 },
        instrumented: false,
        repeat: false,
        related: [],
      }
      await session.dryRun(request)
      let host = await readHost()
      let [forked] = vi.mocked(fork).mock.results
      process.kill((forked!.value as ChildProcess).pid!, 'SIGKILL')
      let error = await host.died

      await expect(session.dryRun(request)).rejects.toBe(error)
    })

    it('closes the workers before the host, whose global teardown still runs', async () => {
      let root = await createProject()
      let file = path.join(root, 'test/add.test.js')
      let session = await start(root)
      await session.dryRun({
        timeouts: { file: 60_000, test: 60_000 },
        files: [{ project: '', file }],
        instrumented: false,
        repeat: false,
        related: [],
      })
      let [hostPid, workerPid] = vi
        .mocked(fork)
        .mock.results.map(result => (result.value as ChildProcess).pid!)
      let host = await readHost()
      let { close } = host
      let aliveAtHostClose = true
      host.close = () => {
        aliveAtHostClose = isAlive(workerPid!)
        return close()
      }

      expect(isAlive(workerPid!)).toBe(true)

      let closed = session.close()

      expect(session.close()).toBe(closed)
      await closed

      expect(aliveAtHostClose).toBe(false)
      expect(isAlive(hostPid!)).toBe(false)
      expect(isAlive(workerPid!)).toBe(false)
      expect(existsSync(path.join(root, 'teardown-ran'))).toBe(true)
    })

    it('collects the warnings of every step in order', async () => {
      let root = await createProject()
      await writeFile(path.join(root, 'lint-runner.js'), '')
      await writeFile(
        path.join(root, 'jest.config.js'),
        `module.exports = {
          projects: [
            { displayName: 'unit', testMatch: ['<rootDir>/test/*.test.js'] },
            { displayName: 'lint', runner: '<rootDir>/lint-runner.js', testMatch: ['<rootDir>/src/*.js'] },
          ],
        }`,
      )
      let session = await start(root, {
        command: 'node --inspect node_modules/jest/bin/jest.js --bail',
      })

      expect(session.diagnostics?.map(item => item.message)).toStrictEqual([
        'mootant ignores --inspect of the test command.',
        'mootant ignores --bail of the test command.',
        "mootant runs only Jest's own runner with jest-circus, so it skips the Jest project lint.",
      ])
      await expect(session.listTestFiles()).resolves.toStrictEqual([
        path.join(root, 'test/add.test.js'),
      ])
    })

    it('hands the Node flags of the command to both Jest processes', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'jest.config.js'),
        `console.log(process.argv.includes('--showConfig') ? 'from show config' : 'from host', process.execArgv.join(' '))
        module.exports = { testEnvironment: 'node' }`,
      )
      await start(root, {
        command: 'node --stack-size=500 node_modules/jest/bin/jest.js',
      })

      expect(output).toStrictEqual([
        'from show config --stack-size=500\n',
        'from host --stack-size=500\n',
      ])
    })

    it('names projects from the real path of a root reached through a link', async () => {
      let root = await createProject()
      let parent = await mkdtemp(path.join(tmpdir(), 'mootant-link-'))
      directories.push(parent)
      let link = path.join(parent, 'link')
      await symlink(root, link)
      await writeFile(
        path.join(root, 'jest.config.js'),
        `module.exports = { projects: ['<rootDir>/a', '<rootDir>/b'] }`,
      )
      await Promise.all(
        ['a', 'b'].map(async name => {
          await mkdir(path.join(root, name))
          await writeFile(path.join(root, name, 'jest.config.js'), '')
          await writeFile(path.join(root, name, 'x.test.js'), '')
        }),
      )
      await start(link)
      let [input] = vi.mocked(startJestHost).mock.calls.at(-1)!

      expect(input.projects.map(project => project.name)).toStrictEqual([
        'a',
        'b',
      ])
    })

    it('keeps a test path pattern after a dropped flag out of a kept list', async () => {
      let root = await createProject()
      await writeFile(path.join(root, 'test/other.test.js'), '')
      let session = await start(root, {
        command: 'jest --testPathIgnorePatterns e2e --coverage other',
      })

      await expect(session.listTestFiles()).resolves.toStrictEqual([
        path.join(root, 'global-setup.js'),
        path.join(root, 'global-teardown.js'),
        path.join(root, 'test/other.test.js'),
      ])
    })

    it('keeps the words after -- as test path patterns, with the flags of mootant before it', async () => {
      let root = await createProject()
      await writeFile(path.join(root, 'test/other.test.js'), '')
      let session = await start(root, { command: 'jest -- add' })

      await expect(session.listTestFiles()).resolves.toStrictEqual([
        path.join(root, 'global-setup.js'),
        path.join(root, 'global-teardown.js'),
        path.join(root, 'test/add.test.js'),
      ])
    })

    it('rejects a broken config with the words of Jest', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'jest.config.js'),
        `module.exports = { preset: 'no-such-preset' }`,
      )

      await expect(start(root)).rejects.toThrow(
        /^Jest exited with code 1 before it printed its configuration:\n[\s\S]*no-such-preset/u,
      )
      expect(fork).not.toHaveBeenCalled()
    })

    it('rejects a throwing globalSetup with its message and leaves no process', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'global-setup.js'),
        `module.exports = () => { throw new Error('the setup broke') }`,
      )

      await expect(start(root)).rejects.toThrow(
        /^Jest exited with code 1 before it reached its tests:\n[\s\S]*the setup broke/u,
      )
      expect(isAlive(readHostPid())).toBe(false)
    })

    it('rejects --passWithNoTests without tests with the sentence and leaves no process', async () => {
      let root = await createProject()
      await rm(path.join(root, 'test'), { recursive: true })

      await expect(
        start(root, { command: 'jest --passWithNoTests' }),
      ).rejects.toThrow(
        `Jest found no test files in ${root}; add a test or fix the Jest configuration.`,
      )
      expect(isAlive(readHostPid())).toBe(false)
    })

    it('does not let --listTests of the command make the host print and exit', async () => {
      let root = await createProject()
      let session = await start(root, { command: 'jest --listTests' })

      expect(session.diagnostics?.map(item => item.message)).toStrictEqual([
        'mootant ignores --listTests of the test command.',
      ])
      expect(output.join('')).not.toContain('add.test.js')
      expect(isAlive(readHostPid())).toBe(true)
    })

    it('rejects --runner of the command before Jest runs', async () => {
      let root = await createProject()

      await expect(
        start(root, { command: 'jest --runner=jest-runner' }),
      ).rejects.toThrow('remove --runner from the test command.')
      expect(fork).not.toHaveBeenCalled()
    })

    it('rejects JEST_JASMINE=1 before the host starts', async () => {
      let root = await createProject()

      await expect(start(root, { env: { JEST_JASMINE: '1' } })).rejects.toThrow(
        'JEST_JASMINE=1 selects jest-jasmine2; unset the variable.',
      )
      expect(fork).not.toHaveBeenCalled()
    })

    it('refuses a Jest whose @jest/core is too old and never runs it', async () => {
      let root = await createProject()
      await rm(path.join(root, 'node_modules/jest'))
      let manifests = {
        jest: { bin: './bin/jest.js', version: '29.0.3' },
        '@jest/core': { version: '26.6.3' },
        'jest-cli': { version: '26.6.3' },
      }
      await Promise.all(
        Object.entries(manifests).map(async ([name, manifest]) => {
          let directory = path.join(root, 'node_modules', name)
          await mkdir(path.join(directory, 'bin'), { recursive: true })
          await writeFile(
            path.join(directory, 'package.json'),
            JSON.stringify(manifest),
          )
        }),
      )
      await writeFile(
        path.join(root, 'node_modules/jest/bin/jest.js'),
        `require('node:fs').writeFileSync(${JSON.stringify(path.join(root, 'jest-ran'))}, '')`,
      )

      await expect(start(root)).rejects.toThrow(
        'mootant runs Jest 29.7 or later, but this project has Jest 26.6.3.',
      )
      expect(existsSync(path.join(root, 'jest-ran'))).toBe(false)
      expect(fork).not.toHaveBeenCalled()
    })

    it('rejects a project without Jest', async () => {
      let root = await createProject()
      await rm(path.join(root, 'node_modules/jest'))

      await expect(start(root)).rejects.toThrow(
        `Jest is not installed in ${root}.`,
      )
    })

    it('resolves died when the host is killed after ready, and tells as it closes that global teardown did not run', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'global-setup.js'),
        `module.exports = () => { console.log('the server is up') }`,
      )
      let session = await start(root)
      let host = await readHost()
      process.kill(readHostPid(), 'SIGKILL')
      let error = await host.died

      expect(error.message).toContain('was stopped by SIGKILL')
      expect(error.message).toContain('the server is up')
      await expect(session.close()).resolves.toStrictEqual([
        expect.objectContaining({
          message: expect.stringMatching(
            /^The Jest process that ran global setup was stopped by SIGKILL before the run ended, so global teardown did not run[\s\S]*the server is up/u,
          ) as string,
          code: 'teardown-failed',
          severity: 'error',
        }) as object,
      ])
    })

    it('reads the configuration after what it logs and hands that text on, with no file', async () => {
      let root = await createProject()
      await writeFile(
        path.join(root, 'jest.config.js'),
        `console.log(process.argv.includes('--showConfig') ? 'from show config' : 'from host')
        module.exports = { testEnvironment: 'node' }`,
      )
      let chunks: [string, string | null][] = []
      let session = await start(
        root,
        {},
        {
          onOutput: (text, file) => {
            chunks.push([text, file])
          },
        },
      )

      expect(chunks[0]).toStrictEqual(['from show config\n', null])
      expect(session.version).toMatch(/^30\./u)
    })

    it('closes the host when the session file cannot be written', async () => {
      let root = await createProject()
      vi.mocked(writeWorkerSession).mockRejectedValueOnce(
        new Error('disk full'),
      )

      await expect(start(root)).rejects.toThrow('disk full')
      expect(isAlive(readHostPid())).toBe(false)
      expect(existsSync(path.join(root, 'teardown-ran'))).toBe(true)
    })
  })
})
