import type { TestSequencerConstructor } from 'vitest/node'
import type { Writable } from 'node:stream'

import {
  beforeEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { BaseSequencer } from 'vitest/node'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { AdapterContext } from '../../../types/adapter/adapter-context'

import { installMutantRuntime } from '../../../core/runtime/install-mutant-runtime'
import { startVitestSession } from '../../../adapters/vitest/start-vitest-session'
import { checkVitestCopy } from '../../../adapters/vitest/check-vitest-copy'
import { detectVitest } from '../../../adapters/vitest/detect-vitest'
import { runIsolated } from '../../../adapters/vitest/run-isolated'
import { runBatch } from '../../../adapters/vitest/run-batch'
import { runDry } from '../../../adapters/vitest/run-dry'

vi.mock(import('../../../adapters/vitest/detect-vitest'), () => ({
  detectVitest: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/check-vitest-copy'), () => ({
  checkVitestCopy: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/run-dry'), () => ({
  runDry: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/run-batch'), () => ({
  runBatch: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/run-isolated'), () => ({
  runIsolated: vi.fn(),
}))

/**
 * Global hook the fake `vitest/node` module calls.
 */
const HOOK = '__mootantCreateVitest'

let context: AdapterContext = {
  workDirectory: '/work',
  concurrency: null,
  root: '/project',
  files: [],
}

describe('startVitestSession', () => {
  let directory: string
  let node: string
  let vitest: {
    config: {
      sequence: { sequencer: TestSequencerConstructor }
      maxWorkers: number
    }
    projects: { config: { globalSetup: string[]; setupFiles: string[] } }[]
    state?: { idMap: Map<string, { file: { filepath: string } }> }
    globTestSpecifications(): Promise<{ moduleId: string }[]>
    close(): Promise<void>
    version: string
  }
  let createVitest = vi.fn()

  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-session-'))
    node = path.join(directory, 'node.mjs')
    await writeFile(
      node,
      `export function createVitest(...args) { return globalThis.${HOOK}(...args) }\nexport class ForksPoolWorker { name = 'forks' }\n`,
    )
    Reflect.set(globalThis, HOOK, createVitest)
  })

  beforeEach(() => {
    vitest = {
      projects: [
        { config: { globalSetup: ['/global.ts'], setupFiles: ['/setup.ts'] } },
        { config: { setupFiles: ['/setup.ts'], globalSetup: [] } },
      ],
      globTestSpecifications: () =>
        Promise.resolve([{ moduleId: '/test/a.test.ts' }]),
      config: { sequence: { sequencer: BaseSequencer }, maxWorkers: 2 },
      close: vi.fn(() => Promise.resolve()),
      version: '5.0.4',
    }
    createVitest.mockReset().mockResolvedValue(vitest)
    vi.mocked(detectVitest).mockResolvedValue({
      version: '5.0.4',
      available: true,
      node,
    })
    vi.mocked(checkVitestCopy).mockReturnValue(null)
  })

  afterAll(async () => {
    Reflect.deleteProperty(globalThis, HOOK)
    await rm(directory, { recursive: true })
  })

  it('starts Vitest with mootant settings and exposes the session', async () => {
    let session = await startVitestSession(context, {})
    let [options, overrides, streams] = createVitest.mock.calls[0] as [
      Record<string, unknown>,
      { plugins: { name: string }[] },
      object,
    ]

    expect(options).toStrictEqual({
      coverage: { enabled: false },
      includeTaskLocation: true,
      passWithNoTests: true,
      fsModuleCache: false,
      root: '/project',
      reporters: [],
      watch: false,
      cache: false,
      bail: 0,
    })
    expect(overrides.plugins.map(plugin => plugin.name)).toStrictEqual([
      'mootant',
    ])
    expect(streams).toStrictEqual({})
    await expect(session.listTestFiles()).resolves.toStrictEqual([
      '/test/a.test.ts',
      '/setup.ts',
      '/global.ts',
    ])
    expect(session.diagnostics).toStrictEqual([])
    expect(session.workers).toBe(2)
    expect(session.version).toBe('5.0.4')

    let request = {
      timeouts: { file: 100, test: 50 },
      related: ['/src/a.ts'],
      instrumented: true,
      repeat: true,
      files: null,
    }
    await session.dryRun(request)
    await session.runBatch({ units: [] })
    await session.runIsolated({ units: [] })
    let [handle] = vi.mocked(runDry).mock.calls[0]!
    let worker = handle.state.pool.createPoolWorker({} as never)

    expect(runDry).toHaveBeenCalledWith(handle, request)
    expect(runBatch).toHaveBeenCalledWith(handle, { units: [] })
    expect(runIsolated).toHaveBeenCalledWith(handle, { units: [] })
    expect(handle.vitest).toBe(vitest)
    expect(vitest.config.sequence.sequencer).not.toBe(BaseSequencer)
    expect(installMutantRuntime().coverage).toBe(handle.state.outside)
    // The pool wraps the forks worker of the project's Vitest.
    expect(handle.state.pool.name).toBe('mootant-forks')
    expect(worker.name).toBe('forks')

    await session.close()
    await session.close()

    expect(vitest.close).toHaveBeenCalledExactlyOnceWith()
    expect(installMutantRuntime().coverage).toBeNull()
  })

  it('hands console calls with their test files and what Vitest and its workers write to onOutput', async () => {
    let output: [string, string | null][] = []
    vitest.state = {
      idMap: new Map([
        ['t1', { file: { filepath: '/project/test/a.test.ts' } }],
      ]),
    }
    await startVitestSession(
      {
        ...context,
        onOutput: (text, file) => {
          output.push([text, file])
        },
      },
      {},
    )
    let [options, , streams] = createVitest.mock.calls[0] as [
      {
        reporters: {
          onUserConsoleLog(log: { content: string; taskId?: string }): void
        }[]
      },
      unknown,
      { stderr: Writable; stdout: Writable },
    ]
    options.reporters[0]!.onUserConsoleLog({ content: 'log\n', taskId: 't1' })
    options.reporters[0]!.onUserConsoleLog({ content: 'top\n' })
    streams.stdout.write('out\n')
    streams.stderr.write(Buffer.from('Warning: x\n'))
    await new Promise(resolve => {
      setImmediate(resolve)
    })

    expect(options.reporters).toHaveLength(1)
    expect(output).toStrictEqual([
      ['log\n', '/project/test/a.test.ts'],
      ['top\n', null],
      ['out\n', null],
      ['Warning: x\n', null],
    ])
  })

  it('leaves a coverage set it did not install when it closes', async () => {
    let session = await startVitestSession(context, {})
    let runtime = installMutantRuntime()
    let other = new Set<string>()
    runtime.coverage = other
    await session.close()

    expect(runtime.coverage).toBe(other)

    runtime.coverage = null
  })

  it('passes the configuration file and concurrency', async () => {
    await startVitestSession(
      { ...context, concurrency: 3 },
      {
        config: 'vitest.unit.ts',
      },
    )

    expect(createVitest.mock.calls[0]![0]).toMatchObject({
      config: path.resolve('/project', 'vitest.unit.ts'),
      maxWorkers: 3,
    })
  })

  it('rejects a missing, unsupported or second copy of Vitest', async () => {
    vi.mocked(detectVitest).mockResolvedValueOnce({
      available: false,
      version: null,
      node: null,
    })

    await expect(startVitestSession(context, {})).rejects.toThrow(
      'Vitest is not installed in /project.',
    )

    vi.mocked(detectVitest).mockResolvedValueOnce({
      available: false,
      version: '4.1.0',
      node: null,
    })

    await expect(startVitestSession(context, {})).rejects.toThrow(
      'mootant runs Vitest 5, but /project has Vitest 4.1.0.',
    )

    vi.mocked(checkVitestCopy).mockReturnValueOnce('different copies')

    await expect(startVitestSession(context, {})).rejects.toThrow(
      'different copies',
    )
    expect(createVitest).not.toHaveBeenCalled()
  })

  it('closes Vitest when a project is not supported', async () => {
    createVitest.mockImplementation(
      (
        _options: unknown,
        overrides: {
          plugins: { configureVitest(context: { project: unknown }): void }[]
        },
      ) => {
        overrides.plugins[0]!.configureVitest({
          project: {
            config: {
              typecheck: { enabled: false },
              browser: { enabled: true },
              experimental: {},
            },
            name: '',
          },
        })
        return Promise.resolve(vitest)
      },
    )

    await expect(startVitestSession(context, {})).rejects.toThrow(
      'browser mode',
    )
    expect(vitest.close).toHaveBeenCalledExactlyOnceWith()
  })
})
