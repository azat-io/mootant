import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { TestProcessOutcome } from '../../../adapters/node-test/types/test-process-outcome'
import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'
import type { NodeTestRecord } from '../../../adapters/node-test/types/node-test-record'
import type { DryRunRequest } from '../../../types/adapter/dry-run-request'

import { createTestProcessOutcome } from '../../helpers/create-test-process-outcome'
import { runTestFile } from '../../../adapters/node-test/run-test-file'
import { createNodeTestEnd } from '../../helpers/create-node-test-end'
import { createNodeTestTry } from '../../helpers/create-node-test-try'
import { runDry } from '../../../adapters/node-test/run-dry'

vi.mock(import('../../../adapters/node-test/run-test-file'), () => ({
  runTestFile: vi.fn(),
}))

/**
 * Work directory of the current test.
 */
let directory = ''

/**
 * Creates a session handle with two test files.
 *
 * @returns Handle whose test files run in a fresh work directory.
 */
async function createHandle(): Promise<NodeTestHandle> {
  directory = await mkdtemp(path.join(tmpdir(), 'mootant-dry-'))
  return {
    context: {
      files: [{ file: '/p/src/a.js', switched: 's', original: 'o' }],
      workDirectory: directory,
      concurrency: null,
      root: '/p',
    },
    state: {
      expected: new Map(),
      modules: new Map(),
      todo: new Map(),
      plan: null,
      count: 0,
    },
    files: ['/p/b.test.js', '/p/a.test.js'],
    preload: '/m/preload/preload.js',
    checkTypeScript: () => null,
    testTimeout: 0,
    node: 'node',
    workers: 2,
    tsx: false,
    args: [],
    env: {},
  }
}

/**
 * Makes test processes leave the given records by test file.
 *
 * @param byFile - Records and exit code by test file.
 */
function mockRuns(
  byFile: Record<string, [NodeTestRecord[], Partial<TestProcessOutcome>?]>,
): void {
  vi.mocked(runTestFile).mockImplementation((_handle, input) => {
    let [records, fields = {}] = byFile[input.file]!
    return Promise.resolve(createTestProcessOutcome(records, fields))
  })
}

/**
 * Builds a dry-run request.
 *
 * @param fields - Fields that differ.
 * @returns Request of a dry run with switched files.
 */
function createRequest(fields: Partial<DryRunRequest> = {}): DryRunRequest {
  return {
    timeouts: { file: 1000, test: 100 },
    related: ['/p/src/a.js'],
    instrumented: true,
    repeat: false,
    files: null,
    ...fields,
  }
}

/**
 * Builds the start record of a test process.
 *
 * @param hooks - Which module hooks switch modules.
 * @returns Start record.
 */
function createStart(hooks: 'async' | 'sync'): NodeTestRecord {
  return { node: 'v20.19.0', kind: 'start', time: 0, pid: 1, hooks }
}

describe('runDry', () => {
  afterEach(async () => {
    vi.mocked(runTestFile).mockReset()
    await rm(directory, { recursive: true, force: true })
  })

  it('runs every test file first and reports those that load related files', async () => {
    let handle = await createHandle()
    let onUnitEnd = vi.fn<() => void>()
    handle.context.onUnitEnd = onUnitEnd
    mockRuns({
      '/p/a.test.js': [
        [
          { file: '/p/src/a.js', kind: 'load' },
          { file: '/p/src/a.js', kind: 'served' },
          { file: '/p/src/c.js', kind: 'mismatched' },
          createNodeTestTry({ failed: true, name: 'todo', seq: 1 }),
          createNodeTestTry({ name: 'a', seq: 0 }),
          createNodeTestEnd(),
        ],
      ],
      '/p/b.test.js': [[createNodeTestTry({ name: 'b', seq: 0 })], { code: 1 }],
    })

    let result = await runDry(handle, createRequest())

    expect(
      result.files.map(file => [file.file, file.loadFailed]),
    ).toStrictEqual([['/p/a.test.js', false]])
    expect(result.files[0]!.dependencies).toContain('/p/src/a.js')
    expect(result.tests.map(test => test.name)).toStrictEqual(['a', 'todo'])
    expect(result).toMatchObject({
      mismatched: ['/p/src/c.js'],
      served: ['/p/src/a.js'],
      outside: [],
      hung: [],
    })
    expect(handle.state.expected.get('/p/a.test.js')).toStrictEqual([
      { occurrence: 0, name: 'todo' },
    ])
    expect(handle.state.modules.get('/p/b.test.js')).toStrictEqual(new Set())
    let [[, input]] = vi.mocked(runTestFile).mock.calls as [
      [unknown, Parameters<typeof runTestFile>[1]],
    ]
    expect(input).toMatchObject({
      hitLimit: null,
      expected: [],
      mutant: null,
      mode: 'dry',
      bail: false,
    })
    expect(input.plan).toBe(handle.state.plan)
    expect(JSON.parse(readFileSync(input.plan, 'utf8'))).toStrictEqual({
      '/p/src/a.js': path.join(directory, 'switched', '0.json'),
    })
    expect(input.deadline({ records: [], spawned: 0, last: 5 })).toBe(1005)
    expect(onUnitEnd.mock.calls).toStrictEqual([[], []])
  })

  it('runs later only the files whose modules include a related file', async () => {
    let handle = await createHandle()
    handle.state.modules.set('/p/a.test.js', new Set(['/p/src/a.js']))
    handle.state.modules.set('/p/b.test.js', new Set(['/p/src/b.js']))
    handle.files.push('/p/c.test.js')
    mockRuns({
      '/p/a.test.js': [
        [{ file: '/p/src/a.js', kind: 'load' }, createNodeTestEnd()],
      ],
      '/p/c.test.js': [[], { signal: 'SIGKILL', code: null, hung: true }],
    })

    let result = await runDry(handle, createRequest())

    expect(
      vi.mocked(runTestFile).mock.calls.map(call => call[1].file),
    ).toStrictEqual(['/p/a.test.js', '/p/c.test.js'])
    expect(result.files.map(file => file.file)).toStrictEqual([
      '/p/a.test.js',
      '/p/c.test.js',
    ])
    expect(result.hung).toStrictEqual([
      { file: '/p/c.test.js', name: null, test: null },
    ])
    expect(result.files[1]!.dependencies).toBeNull()
  })

  it('reports switched files that require() of an ES module loaded', async () => {
    let handle = await createHandle()
    handle.context.files = [
      ...handle.context.files,
      { file: '/p/src/b.mjs', switched: 's', original: 'o' },
      { file: '/p/src/c.mjs', switched: 's', original: 'o' },
    ]
    let required = ['/p/src/a.js', '/p/src/b.mjs', '/p/src/c.mjs', '/p/x.js']
    mockRuns({
      '/p/a.test.js': [
        [
          createStart('async'),
          { file: '/p/src/a.js', kind: 'served' },
          { file: '/p/src/c.mjs', kind: 'mismatched' },
          createNodeTestEnd({ required }),
        ],
      ],
      '/p/b.test.js': [
        [createStart('sync'), createNodeTestEnd({ required: ['/p/src/a.js'] })],
      ],
    })

    let result = await runDry(handle, createRequest())

    expect(result.unserved).toStrictEqual([
      {
        reason:
          'a test loads it through require() of an ES module, which Node before 22.15 runs past module hooks; use Node 22.15 or later',
        file: '/p/src/b.mjs',
      },
    ])
  })

  it('runs selected files as given, without switching when asked', async () => {
    let handle = await createHandle()
    mockRuns({ '/p/b.test.js': [[createNodeTestEnd()]] })

    let result = await runDry(
      handle,
      createRequest({
        files: [{ file: '/p/b.test.js', project: '' }],
        instrumented: false,
      }),
    )

    expect(result.files.map(file => file.file)).toStrictEqual(['/p/b.test.js'])
    let [[, { plan }]] = vi.mocked(runTestFile).mock.calls as [
      [unknown, Parameters<typeof runTestFile>[1]],
    ]
    expect(JSON.parse(readFileSync(plan, 'utf8'))).toStrictEqual({})
    expect(handle.state.plan).toBeNull()
  })

  it('rejects switched files mootant cannot switch', async () => {
    let handle = await createHandle()
    let checked: (readonly string[])[] = []
    handle.checkTypeScript = files => {
      checked.push(files)
      return 'No.'
    }

    await expect(runDry(handle, createRequest())).rejects.toThrow('No.')
    expect(checked).toStrictEqual([['/p/src/a.js']])
    expect(runTestFile).not.toHaveBeenCalled()
  })

  it('rejects repeated tries', async () => {
    let handle = await createHandle()

    await expect(
      runDry(handle, createRequest({ repeat: true })),
    ).rejects.toThrow(
      'The node-test adapter runs each test once; it cannot try tests twice in a row.',
    )
  })
})
