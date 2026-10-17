import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type {
  VitestSessionState,
  VitestHandle,
} from '../../../adapters/vitest/types/vitest-session-state'
import type {
  VitestOutRecord,
  VitestHeartbeat,
} from '../../../adapters/vitest/types/vitest-worker'
import type { SwitchedFile } from '../../../types/adapter/switched-file'

import { getFileHash } from '../../../adapters/vitest/worker/get-file-hash'
import { watchHeartbeats } from '../../../adapters/vitest/watch-heartbeats'
import { stopHungWorker } from '../../../adapters/vitest/stop-hung-worker'
import { createTryFacts } from '../../helpers/create-try-facts'
import { runDry } from '../../../adapters/vitest/run-dry'

vi.mock(import('../../../adapters/vitest/watch-heartbeats'), () => ({
  watchHeartbeats: vi.fn(),
}))

vi.mock(import('../../../adapters/vitest/stop-hung-worker'), () => ({
  stopHungWorker: vi.fn(),
}))

/**
 * Watchdog budgets of the dry runs of the tests.
 */
const TIMEOUTS = { file: 100, test: 50 }

/**
 * Vitest project as the session reads it.
 */
interface FakeProject {
  vite: { environments: Record<string, unknown> }
  name: string
}

/**
 * Specification as the session reads it: file, project and pool.
 */
interface FakeSpecification {
  moduleId: string
  project: unknown
  pool: string
}

let project: FakeProject = { vite: { environments: {} }, name: '' }

let other: FakeProject = { vite: { environments: {} }, name: 'b' }

/**
 * Builds the end record of a test file.
 *
 * @param fields - Fields that differ from a clean load.
 * @returns End record.
 */
function createEnd(fields: Partial<VitestOutRecord> = {}): VitestOutRecord {
  return {
    concurrent: false,
    abandoned: false,
    loadDuration: 3,
    hookError: null,
    loadError: null,
    environment: [],
    covers: ['s1'],
    reached: false,
    modified: [],
    duration: 5,
    kind: 'end',
    strays: [],
    hits: 2,
    unit: 0,
    ...fields,
  } as VitestOutRecord
}

/**
 * Builds the record of a test with its tries.
 *
 * @param id - Id of the test, also its name.
 * @param count - How many tries the test ran.
 * @returns Out record of kind `test` on line 1.
 */
function createTestRecord(id: string, count = 1): VitestOutRecord {
  return {
    tries: Array.from({ length: count }, () => createTryFacts({ test: id })),
    kind: 'test',
    name: id,
    line: 1,
  }
}

/**
 * Creates a specification of the fake project.
 *
 * @param moduleId - Absolute path of the test file.
 * @param pool - Vitest pool, such as `typescript` for type tests.
 * @returns Specification of the file in the fake project.
 */
function createSpecification(
  moduleId: string,
  pool = 'forks',
): FakeSpecification {
  return { moduleId, project, pool }
}

describe('runDry', () => {
  let directory: string
  let handle: VitestHandle
  let files: SwitchedFile[]
  let outputs: Record<string, VitestOutRecord[]>
  let ran: FakeSpecification[][]
  let instrumented: boolean[]
  let related: (undefined | string[])[]
  let hung: VitestHeartbeat[]

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-dry-'))
    files = [
      { file: '/src/a.ts', original: 'a', switched: 'A' },
      { file: '/src/b.ts', original: 'b', switched: 'B' },
    ]
    outputs = {}
    ran = []
    instrumented = []
    related = []
    hung = []
    let onHung: ((beat: VitestHeartbeat) => Promise<void>) | null = null
    vi.mocked(watchHeartbeats).mockImplementation((_directory, react) => {
      onHung = react
      return { stop: () => Promise.resolve() }
    })
    vi.mocked(stopHungWorker).mockImplementation(pid =>
      Promise.resolve(pid > 0),
    )
    let state: VitestSessionState = {
      pool: { createPoolWorker: () => null as never, name: 'pool' },
      runnerPath: '/runner.ts',
      mismatched: new Set(),
      instrumented: true,
      outside: new Set(),
      served: new Set(),
      environment: {},
      keys: new Map(),
      diagnostics: [],
      files: null,
      error: null,
    }
    let vitest = {
      runTestSpecifications: async (specifications: FakeSpecification[]) => {
        ran.push(specifications)
        instrumented.push(state.instrumented)
        await Promise.all(hung.map(beat => onHung!(beat)))
        state.served.add('/src/b.ts')
        state.served.add('/src/a.ts')
        state.mismatched.add('/src/b.ts')
        state.outside.add('m2')
        state.outside.add('m1')
        await Promise.all(
          Object.entries(outputs).map(([name, records]) =>
            writeFile(
              path.join(directory, 'out', `${name}.jsonl`),
              records.map(record => `${JSON.stringify(record)}\n`).join(''),
            ),
          ),
        )
        await writeFile(
          path.join(directory, 'env', 'a.json'),
          JSON.stringify({ variables: { MODE: 'h' }, project: '' }),
        )
        await writeFile(path.join(directory, 'env', 'b.json'), '{"proj')
        return { unhandledErrors: [] }
      },
      getRelevantTestSpecifications: () => {
        related.push(vitest.config.related)
        return Promise.resolve([
          createSpecification('/test/b.test.ts'),
          createSpecification('/test/a.test.ts'),
          createSpecification('/test/c.test.ts'),
          createSpecification('/test/a.test-d.ts', 'typescript'),
          { moduleId: '/test/a.test.ts', project: other, pool: 'forks' },
        ])
      },
      config: { related: undefined as undefined | string[] },
      invalidateFile: vi.fn(),
      provide: vi.fn(),
    }
    handle = {
      context: { workDirectory: directory, root: '/', files },
      vitest,
      state,
    } as never
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('runs the related tests of every project and reads their facts', async () => {
    let a = getFileHash('/test/a.test.ts', '')
    let ab = getFileHash('/test/a.test.ts', 'b')
    let b = getFileHash('/test/b.test.ts', '')
    outputs = {
      [`${a}-2`]: [
        createTestRecord('a1', 2),
        { message: 'ignored', kind: 'late', mutant: null, test: 'a1' },
        createEnd({
          dependencies: ['/src/a.ts?v=1'],
          modified: ['/test/a.json'],
          environment: ['MODE'],
          duration: 4,
        }),
      ],
      [`${b}-1`]: [
        createTestRecord('b1'),
        createEnd({
          hookError: 'afterAll boom',
          loadError: 'load boom',
          strays: ['stray'],
        }),
      ],
      [`${ab}-3`]: [
        createTestRecord('ab1'),
        createEnd({ hookError: 'afterAll boom', duration: 20 }),
      ],
    }
    let result = await runDry(handle, {
      related: ['/src/a.ts'],
      timeouts: TIMEOUTS,
      instrumented: true,
      repeat: true,
      files: null,
    })

    expect(related).toStrictEqual([['/src/a.ts']])
    expect(handle.vitest.config.related).toBeUndefined()
    expect(handle.vitest.provide).toHaveBeenCalledWith('mootant', {
      timeouts: TIMEOUTS,
      repeat: true,
      mode: 'dry',
      root: '/',
      directory,
    })
    expect(handle.state.environment).toStrictEqual({ '': { MODE: 'h' } })
    expect(
      ran[0]!.map(
        specification =>
          `${(specification.project as FakeProject).name}:${specification.moduleId}`,
      ),
    ).toStrictEqual([
      ':/test/b.test.ts',
      ':/test/a.test.ts',
      ':/test/c.test.ts',
      'b:/test/a.test.ts',
    ])
    let clean = {
      concurrent: false,
      loadFailed: false,
      loadDuration: 3,
      covers: ['s1'],
      errors: [],
      hits: 2,
    }
    expect(result).toStrictEqual({
      files: [
        {
          dependencies: [
            '/src/a.ts',
            '/src/tsconfig.json',
            '/test/a.test.ts',
            '/test/tsconfig.json',
            '/tsconfig.json',
          ],
          modified: ['/test/a.json'],
          file: '/test/a.test.ts',
          environment: ['MODE'],
          hookDuration: 0,
          project: '',
          ...clean,
        },
        {
          ...clean,
          errors: ['afterAll boom'],
          file: '/test/a.test.ts',
          dependencies: null,
          loadFailed: true,
          hookDuration: 16,
          environment: [],
          modified: [],
          project: 'b',
        },
        {
          errors: ['load boom', 'afterAll boom', 'stray'],
          file: '/test/b.test.ts',
          dependencies: null,
          concurrent: false,
          loadFailed: true,
          environment: [],
          hookDuration: 1,
          loadDuration: 3,
          covers: ['s1'],
          modified: [],
          project: '',
          hits: 2,
        },
        {
          errors: ['The test runner did not report this file.'],
          file: '/test/c.test.ts',
          concurrent: false,
          loadFailed: true,
          hookDuration: 0,
          loadDuration: 0,
          project: '',
          covers: [],
          hits: 0,
        },
      ],
      tests: [
        {
          tries: [
            createTryFacts({ test: 'a1' }),
            createTryFacts({ test: 'a1' }),
          ],
          file: '/test/a.test.ts',
          project: '',
          name: 'a1',
          id: 'a1',
          line: 1,
        },
        {
          tries: [createTryFacts({ test: 'ab1' })],
          file: '/test/a.test.ts',
          project: 'b',
          name: 'ab1',
          id: 'ab1',
          line: 1,
        },
        {
          tries: [createTryFacts({ test: 'b1' })],
          file: '/test/b.test.ts',
          project: '',
          name: 'b1',
          id: 'b1',
          line: 1,
        },
      ],
      served: ['/src/a.ts', '/src/b.ts'],
      mismatched: ['/src/b.ts'],
      outside: ['m1', 'm2'],
      hung: [],
    })
    expect(instrumented).toStrictEqual([true])
    expect(handle.vitest.invalidateFile).not.toHaveBeenCalled()
  })

  it('reruns selected test files once without switched files', async () => {
    let result = await runDry(handle, {
      files: [
        { file: '/test/a.test.ts', project: 'b' },
        { file: '/test/d.test.ts', project: '' },
      ],
      related: ['/src/a.ts'],
      instrumented: false,
      timeouts: TIMEOUTS,
      repeat: false,
    })
    await runDry(handle, {
      related: ['/src/a.ts'],
      timeouts: TIMEOUTS,
      instrumented: true,
      repeat: true,
      files: null,
    })

    expect(ran[0]).toStrictEqual([
      { moduleId: '/test/a.test.ts', project: other, pool: 'forks' },
    ])
    expect(handle.vitest.provide).toHaveBeenCalledWith('mootant', {
      timeouts: TIMEOUTS,
      repeat: false,
      mode: 'dry',
      root: '/',
      directory,
    })
    expect(instrumented).toStrictEqual([false, true])
    expect(handle.state.instrumented).toBe(true)
    expect(vi.mocked(handle.vitest.invalidateFile).mock.calls).toStrictEqual([
      ['/src/a.ts'],
      ['/src/b.ts'],
      ['/src/a.ts'],
      ['/src/b.ts'],
    ])
    expect(result.files).toStrictEqual([
      {
        errors: ['The test runner did not report this file.'],
        file: '/test/a.test.ts',
        concurrent: false,
        loadFailed: true,
        hookDuration: 0,
        loadDuration: 0,
        project: 'b',
        covers: [],
        hits: 0,
      },
    ])
  })

  it('drops cached transforms of removed files', async () => {
    let request = {
      related: ['/src/a.ts'],
      timeouts: TIMEOUTS,
      instrumented: true,
      repeat: true,
      files: null,
    }
    await runDry(handle, request)
    files.splice(1, 1)
    await runDry(handle, request)

    expect(vi.mocked(handle.vitest.invalidateFile).mock.calls).toStrictEqual([
      ['/src/b.ts'],
    ])
    expect([...handle.state.files!.keys()]).toStrictEqual(['/src/a.ts'])
  })

  it('reports the workers the watchdog stopped', async () => {
    let beat: VitestHeartbeat = {
      file: '/test/a.test.ts',
      name: 'suite > loops',
      mutant: null,
      sequence: 4,
      test: 'a1',
      budget: 51,
      unit: 0,
      pid: 7,
    }
    hung = [beat, { ...beat, pid: 0 }]

    let result = await runDry(handle, {
      related: ['/src/a.ts'],
      timeouts: TIMEOUTS,
      instrumented: true,
      repeat: true,
      files: null,
    })

    expect(result.hung).toStrictEqual([
      { file: '/test/a.test.ts', name: 'suite > loops', test: 'a1' },
    ])
  })
})
