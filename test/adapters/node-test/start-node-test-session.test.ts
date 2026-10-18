import { writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { availableParallelism, tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { realpathSync } from 'node:fs'
import path from 'node:path'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { AdapterContext } from '../../../types/adapter/adapter-context'

import { startNodeTestSession } from '../../../adapters/node-test/start-node-test-session'
import { readNodeRuntime } from '../../../adapters/node-test/read-node-runtime'
import { getPreloadPath } from '../../../adapters/node-test/get-preload-path'
import { runIsolated } from '../../../adapters/node-test/run-isolated'
import { runDry } from '../../../adapters/node-test/run-dry'

vi.mock(import('../../../adapters/node-test/read-node-runtime'), () => ({
  readNodeRuntime: vi.fn(),
}))

vi.mock(import('../../../adapters/node-test/run-dry'), () => ({
  runDry: vi.fn(),
}))

vi.mock(import('../../../adapters/node-test/run-isolated'), () => ({
  runIsolated: vi.fn(),
}))

/**
 * Temporary project of the current test.
 */
let root = ''

/**
 * Environment variables of the process before a test changes them.
 */
const SAVED = { ...process.env }

/**
 * URL of mootant's preload as test processes import it.
 */
const PRELOAD = pathToFileURL(getPreloadPath()).href

/**
 * Reporter flags that end the flags of every test process.
 */
const REPORTERS = [
  '--test-reporter',
  pathToFileURL(path.join(path.dirname(getPreloadPath()), 'reporter.ts')).href,
  '--test-reporter-destination',
  'stderr',
  '--test-reporter',
  'spec',
  '--test-reporter-destination',
  'stdout',
]

/**
 * Creates a project.
 *
 * @param manifest - Its `package.json`.
 * @param files - Paths of empty files relative to it.
 * @returns Context of a session in it.
 */
async function createProject(
  manifest: object,
  files: string[],
): Promise<AdapterContext> {
  root = realpathSync(await mkdtemp(path.join(tmpdir(), 'mootant-session-')))
  await writeFile(path.join(root, 'package.json'), JSON.stringify(manifest))
  await Promise.all(
    files.map(async file => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), '')
    }),
  )
  return {
    workDirectory: path.join(root, '.work'),
    concurrency: 2,
    files: [],
    root,
  }
}

/**
 * Reads the flags and variables a session gives test processes.
 *
 * @param context - Context of the session.
 * @param options - Options of the adapter.
 * @returns Arguments and variables of the processes.
 */
async function readHandle(
  context: AdapterContext,
  options: Parameters<typeof startNodeTestSession>[1] = {},
): Promise<NodeTestHandle> {
  let session = await startNodeTestSession(context, options)
  await session.dryRun({
    timeouts: { file: 1, test: 1 },
    instrumented: true,
    repeat: false,
    files: null,
    related: [],
  })
  let [handle] = vi.mocked(runDry).mock.calls.at(-1)!
  return handle
}

/**
 * Makes the Node binary report a version.
 *
 * @param version - Version, such as `v26.0.0`.
 * @param typescript - Whether it strips types by default.
 */
function mockRuntime(version: string, typescript = false): void {
  vi.mocked(readNodeRuntime).mockResolvedValue({ typescript, version })
}

describe('startNodeTestSession', () => {
  afterEach(async () => {
    vi.mocked(readNodeRuntime).mockReset()
    vi.mocked(runDry).mockReset()
    vi.mocked(runIsolated).mockReset()
    process.env = { ...SAVED }
    await rm(root, { recursive: true, force: true })
  })

  it('starts a session from the test script', async () => {
    process.env['NODE_TEST_CONTEXT'] = 'child'
    process.env['MOOTANT_UNIT'] = '{}'
    process.env['NODE_OPTIONS'] = '--max-old-space-size=100'
    let context = await createProject(
      {
        scripts: {
          test: 'A=1 node --test --import ./setup.js --watch "test/*.test.js"',
        },
      },
      ['test/a.test.js', 'test/b.spec.js', 'setup.js'],
    )
    context.files = [
      { file: path.join(root, 'src', 'a.ts'), switched: '', original: '' },
    ]
    mockRuntime('v26.11.1', true)

    let session = await startNodeTestSession(context, {})

    expect(session).toMatchObject({
      diagnostics: [
        { message: 'mootant ignores --watch of the test command.' },
      ],
      version: '26.11.1',
      workers: 2,
    })
    await expect(session.listTestFiles()).resolves.toStrictEqual([
      path.join(root, 'test', 'a.test.js'),
      path.join(root, 'setup.js'),
    ])
    await expect(session.cacheInputs!()).resolves.toMatchObject({
      settings: {
        nodeOptions: '--max-old-space-size=100',
        execArgv: ['--import', './setup.js'],
        version: 'v26.11.1',
        env: { A: '1' },
      },
    })
    await expect(session.runBatch({ units: [] })).rejects.toThrow(
      'The node-test adapter has no batch mode.',
    )
    await expect(session.close()).resolves.toBeUndefined()
    await session.runIsolated({ units: [] })

    expect(vi.mocked(runIsolated).mock.calls[0]![1]).toStrictEqual({
      units: [],
    })

    let handle = await readHandle(context)

    expect(handle.args).toStrictEqual([
      '--import',
      PRELOAD,
      '--import',
      './setup.js',
      ...REPORTERS,
    ])
    expect(handle.env).toMatchObject({ A: '1' })
    expect(handle.env['NODE_TEST_CONTEXT']).toBe('mootant')
    expect(handle.env['MOOTANT_UNIT']).toBeUndefined()
    expect(handle).toMatchObject({
      node: process.execPath,
      workers: 2,
      tsx: false,
    })
  })

  it('applies the options', async () => {
    let context = await createProject({}, ['a.test.js', 'b.js'])
    context.concurrency = null
    mockRuntime('v22.12.0')

    let handle = await readHandle(context, {
      command: 'node --test --test-only --test-timeout=500',
      execArgv: ['--conditions=dev'],
      env: { B: '2' },
      files: ['b.js'],
      node: '/n/node',
    })

    expect(readNodeRuntime).toHaveBeenCalledWith('/n/node')
    expect(handle).toMatchObject({
      args: [
        '--import',
        PRELOAD,
        '--test-only',
        '--test-timeout=500',
        '--conditions=dev',
        ...REPORTERS,
      ],
      workers: Math.max(1, availableParallelism() - 1),
      files: [path.join(root, 'b.js')],
      testTimeout: 500,
      env: { B: '2' },
      node: '/n/node',
    })
  })

  it('puts the preload into NODE_OPTIONS when they load modules', async () => {
    process.env['NODE_OPTIONS'] = '--import tsx'
    let context = await createProject({ type: 'module' }, ['a.test.js'])
    mockRuntime('v26.11.1', true)

    let handle = await readHandle(context)

    expect(handle.args).toStrictEqual(REPORTERS)
    expect(handle.env['NODE_OPTIONS']).toBe(`--import=${PRELOAD} --import tsx`)
  })

  it('requires the preload first when the project requires modules', async () => {
    let context = await createProject(
      {
        scripts: {
          test: 'node --test --require ./setup.cjs --loader ./loader.mjs',
        },
      },
      ['a.test.js'],
    )
    mockRuntime('v26.11.1', true)

    let session = await startNodeTestSession(context, {})

    expect(session.diagnostics).toStrictEqual([
      {
        message:
          "The loader ./loader.mjs runs before mootant's module hooks, so mootant cannot switch the modules it changes.",
        code: 'config-overridden',
        severity: 'warning',
        column: null,
        line: null,
        file: null,
      },
    ])

    let handle = await readHandle(context)

    expect(handle.args).toStrictEqual([
      '--require',
      getPreloadPath(),
      '--require',
      './setup.cjs',
      '--loader',
      './loader.mjs',
      ...REPORTERS,
    ])
  })

  it('reads the loaders of NODE_OPTIONS', async () => {
    process.env['NODE_OPTIONS'] = '--require ts-node/register'
    let context = await createProject({ type: 'module' }, ['a.test.ts'])
    mockRuntime('v26.11.1', true)

    await expect(startNodeTestSession(context, {})).rejects.toThrow(
      'so it cannot run the tests of',
    )
  })

  it('checks the switched TypeScript files', async () => {
    let context = await createProject({ type: 'module' }, ['a.test.js'])
    mockRuntime('v26.11.1', true)

    let handle = await readHandle(context, { execArgv: ['--import', 'tsx'] })

    expect(handle.checkTypeScript([path.join(root, 'a.ts')])).toBeNull()
    expect(handle.checkTypeScript([path.join(root, 'a.cts')])).toContain(
      'tsx loads as CommonJS',
    )
  })

  it('rejects a command no test file matches', async () => {
    let context = await createProject(
      { scripts: { test: 'node --test test/' } },
      ['a.test.js'],
    )
    mockRuntime('v26.11.1', true)

    await expect(startNodeTestSession(context, {})).rejects.toThrow(
      'No test files match "test/"; set nodeTestAdapter({ files }) or fix the test script.',
    )

    let empty = await createProject({}, ['src/a.js'])

    await expect(startNodeTestSession(empty, {})).rejects.toThrow(
      'No test files match the default test file patterns; set nodeTestAdapter({ files }) or fix the test script.',
    )
  })

  it('keeps the cache key of a randomized command across sessions', async () => {
    let context = await createProject(
      { scripts: { test: 'node --test --test-randomize' } },
      ['a.test.js'],
    )
    mockRuntime('v26.11.1', true)

    let first = await startNodeTestSession(context, {})
    let second = await startNodeTestSession(context, {})

    await expect(first.cacheInputs!()).resolves.toMatchObject({
      settings: { execArgv: ['--test-randomize', '--test-random-seed=1'] },
    })
    await expect(second.cacheInputs!()).resolves.toStrictEqual(
      await first.cacheInputs!(),
    )
  })

  it('rejects unsupported Node versions', async () => {
    let context = await createProject({}, [])
    mockRuntime('v21.7.0')

    await expect(startNodeTestSession(context, {})).rejects.toThrow(
      `mootant runs node:test on Node 20.19 or a later 20.x and on Node 22.12 or later, but ${process.execPath} is Node v21.7.0.`,
    )
  })

  it('lists TypeScript test files only where they load', async () => {
    let context = await createProject({ type: 'module' }, [
      'a.test.ts',
      'b.test.js',
    ])
    mockRuntime('v26.11.1', true)

    await expect(readHandle(context)).resolves.toMatchObject({
      files: [path.join(root, 'a.test.ts'), path.join(root, 'b.test.js')],
    })
    await expect(
      readHandle(context, { execArgv: ['--no-experimental-strip-types'] }),
    ).resolves.toMatchObject({ files: [path.join(root, 'b.test.js')] })

    mockRuntime('v22.12.0')

    await expect(readHandle(context)).resolves.toMatchObject({
      files: [path.join(root, 'b.test.js')],
    })
    await expect(
      readHandle(context, { execArgv: ['--experimental-strip-types'] }),
    ).resolves.toMatchObject({
      files: [path.join(root, 'a.test.ts'), path.join(root, 'b.test.js')],
    })
    await expect(
      readHandle(context, { execArgv: ['--experimental-transform-types'] }),
    ).resolves.toMatchObject({
      files: [path.join(root, 'a.test.ts'), path.join(root, 'b.test.js')],
    })
  })

  it('adds the TypeScript flags of better-node-test', async () => {
    let context = await createProject(
      { scripts: { test: 'bnt' }, type: 'module' },
      ['a.test.ts', 'node_modules/tsx/dist/loader.mjs'],
    )
    await writeFile(
      path.join(root, 'node_modules', 'tsx', 'package.json'),
      JSON.stringify({ exports: { '.': './dist/loader.mjs' }, name: 'tsx' }),
    )
    let loader = pathToFileURL(
      path.join(root, 'node_modules', 'tsx', 'dist', 'loader.mjs'),
    ).href
    mockRuntime('v22.12.0')

    await expect(readHandle(context)).resolves.toMatchObject({
      args: [
        '--import',
        PRELOAD,
        '--disable-warning=ExperimentalWarning',
        '--experimental-strip-types',
        ...REPORTERS,
      ],
    })

    mockRuntime('v24.0.0')

    await expect(readHandle(context)).resolves.toMatchObject({
      args: [
        '--import',
        PRELOAD,
        '--disable-warning=ExperimentalWarning',
        '--experimental-strip-types',
        ...REPORTERS,
      ],
    })

    mockRuntime('v20.19.0')

    await expect(readHandle(context)).resolves.toMatchObject({
      args: [
        '--import',
        PRELOAD,
        '--enable-source-maps',
        '--import',
        loader,
        ...REPORTERS,
      ],
      env: { NODE_ENV: 'test' },
      tsx: true,
    })

    mockRuntime('v20.19.0')
    await rm(path.join(root, 'node_modules'), { recursive: true })

    await expect(startNodeTestSession(context, {})).rejects.toThrow(
      'cannot run the TypeScript files',
    )
  })

  it('keeps better-node-test without TypeScript as it is', async () => {
    let context = await createProject({ scripts: { test: 'bnt' } }, [
      'a.test.js',
    ])
    mockRuntime('v20.19.0')

    await expect(readHandle(context)).resolves.toMatchObject({
      args: ['--import', PRELOAD, ...REPORTERS],
    })
  })
})
