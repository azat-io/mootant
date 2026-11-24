import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import type { NodeTestHandle } from '../../../adapters/node-test/types/node-test-handle'

import { createSpareProcesses } from '../../../adapters/node-test/create-spare-processes'
import { startTestProcess } from '../../../adapters/node-test/start-test-process'
import { stopProcessGroup } from '../../../adapters/shared/stop-process-group'

vi.mock(import('../../../adapters/node-test/start-test-process'), () => ({
  startTestProcess: vi.fn(),
}))

vi.mock(import('../../../adapters/shared/stop-process-group'), () => ({
  stopProcessGroup: vi.fn<(pid: number) => void>(),
}))

/**
 * Fake spare process.
 */
interface FakeChild extends EventEmitter {
  /**
   * Pipe of file descriptor 3, or null.
   */
  stdio: [null, null, null, EventEmitter | null]

  /**
   * Signal that ended the process, or null.
   */
  signalCode: NodeJS.Signals | null

  /**
   * Exit code of the process, or null.
   */
  exitCode: number | null

  /**
   * Process id, or undefined when it did not start.
   */
  pid: undefined | number

  /**
   * Binary and arguments.
   */
  spawnargs: string[]
}

/**
 * Fake spare processes, in the order they started.
 */
let started: FakeChild[] = []

/**
 * Makes `startTestProcess` start fake spare processes.
 *
 * @param fields - Gives the fields that differ for the spare with the given
 *   position.
 */
function mockSpares(
  fields: (position: number) => Partial<FakeChild> = () => ({}),
): void {
  vi.mocked(startTestProcess).mockImplementation(options => {
    // eslint-disable-next-line unicorn/prefer-event-target -- A ChildProcess is an EventEmitter.
    let child: FakeChild = Object.assign(new EventEmitter(), {
      // eslint-disable-next-line unicorn/prefer-event-target -- A Socket is an EventEmitter.
      stdio: [null, null, null, new EventEmitter()] as FakeChild['stdio'],
      spawnargs: [options.node, ...options.args],
      pid: 100 + started.length,
      signalCode: null,
      exitCode: null,
      ...fields(started.length),
    })
    started.push(child)
    return child as never
  })
}

/**
 * Creates a session handle.
 *
 * @param spares - Most spares at once.
 * @returns Handle of a session.
 */
function createHandle(spares: number): NodeTestHandle {
  return {
    context: {
      workDirectory: '/work',
      onOutput: () => {},
      concurrency: null,
      root: '/project',
      files: [],
    },
    state: {
      expected: new Map(),
      modules: new Map(),
      todo: new Map(),
      plan: null,
      count: 0,
    },
    checkTypeScript: () => null,
    args: ['--import', 'pre'],
    preload: '/preload.js',
    groups: new Set(),
    env: { A: '1' },
    commonjs: false,
    testTimeout: 0,
    node: '/node',
    workers: 3,
    pipe: true,
    tsx: false,
    files: [],
    spares,
  }
}

/**
 * Names the test files of the fake spares that still run.
 *
 * @returns Test file of each such spare.
 */
function listRunning(): string[] {
  return started
    .filter(child => child.exitCode === null)
    .map(child => child.spawnargs.at(-1)!.replace('/project/', ''))
}

describe('createSpareProcesses', () => {
  afterEach(() => {
    vi.mocked(startTestProcess).mockReset()
    vi.mocked(stopProcessGroup).mockReset()
    started = []
  })

  it('starts spares for the first waiting jobs, one per key, and gives them to the jobs of their files', () => {
    mockSpares()
    let handle = createHandle(2)
    let jobs = ['a', 'a', 'b', 'a', 'c'].map(name => ({
      file: `/project/${name}`,
      key: `/project/${name}`,
    }))
    let spares = createSpareProcesses(handle, jobs)

    expect(spares.take(0, false)).toBeNull()
    expect(listRunning()).toStrictEqual(['a', 'b'])
    expect(vi.mocked(startTestProcess).mock.calls[0]![0]).toStrictEqual({
      args: ['--import', 'pre', '/project/a'],
      env: { MOOTANT_UNIT_FD: '3', A: '1' },
      groups: handle.groups,
      cwd: '/project',
      output: 'pipe',
      node: '/node',
      pipe: true,
    })
    expect(spares.take(1, false)).toBe(started[0])
    expect(listRunning()).toStrictEqual(['a', 'b', 'a'])
    expect(spares.take(2, false)).toBe(started[1])
    expect(listRunning()).toStrictEqual(['a', 'b', 'a', 'c'])
    expect(spares.take(4, false)).toBe(started[3])
    expect(spares.take(3, false)).toBe(started[2])
    expect(started).toHaveLength(4)

    spares.stop()

    expect(stopProcessGroup).not.toHaveBeenCalled()
  })

  it('starts a spare per waiting job of a file when every job has a key of its own', () => {
    mockSpares(() => ({ stdio: [null, null, null, null] }))
    let spares = createSpareProcesses(
      createHandle(3),
      ['a', 'a', 'a', 'a'].map((name, index) => ({
        file: `/project/${name}`,
        key: String(index),
      })),
    )
    spares.take(0, false)

    expect(listRunning()).toStrictEqual(['a', 'a', 'a'])

    spares.stop()

    expect(vi.mocked(stopProcessGroup).mock.calls).toStrictEqual([
      [100],
      [101],
      [102],
    ])
  })

  it('keeps the spare for a later job when a job must start a process of its own', () => {
    mockSpares()
    let spares = createSpareProcesses(
      createHandle(1),
      ['a', 'a', 'a'].map(name => ({ file: `/project/${name}`, key: name })),
    )
    spares.take(0, false)

    expect(spares.take(1, true)).toBeNull()
    expect(spares.take(2, false)).toBe(started[0])
    expect(started).toHaveLength(1)
  })

  it('drops spares that ended or failed, and gives none whose process ended unseen', () => {
    mockSpares(position => (position === 3 ? { pid: undefined } : {}))
    let spares = createSpareProcesses(
      createHandle(1),
      ['a', 'a', 'a', 'a', 'a', 'a'].map(name => ({
        file: `/project/${name}`,
        key: name,
      })),
    )
    spares.take(0, false)
    started[0]!.emit('exit', 1, null)
    started[0]!.emit('error', new Error('again'))
    started[0]!.stdio[3]!.emit('error', new Error('EPIPE'))

    expect(spares.take(1, false)).toBeNull()

    started[1]!.signalCode = 'SIGKILL'

    expect(spares.take(2, false)).toBeNull()

    started[2]!.exitCode = 0

    expect(spares.take(3, false)).toBeNull()
    expect(spares.take(4, false)).toBeNull()

    spares.stop()

    expect(vi.mocked(stopProcessGroup).mock.calls).toStrictEqual([[104]])
  })

  it('drops the output of spares without a receiver, and stops no spare that never started', () => {
    mockSpares(() => ({ stdio: [null, null, null, null], pid: undefined }))
    let handle = createHandle(1)
    let { onOutput, ...context } = handle.context
    let spares = createSpareProcesses({ ...handle, context }, [
      { file: '/project/a', key: 'a' },
      { file: '/project/a', key: 'a' },
    ])
    spares.take(0, false)
    spares.stop()

    expect(onOutput).toBeDefined()
    expect(vi.mocked(startTestProcess).mock.calls[0]![0].output).toBe('ignore')
    expect(stopProcessGroup).not.toHaveBeenCalled()
  })

  it('stops the spares of a test file that has no job left to start', () => {
    mockSpares()
    let spares = createSpareProcesses(createHandle(1), [
      { file: '/project/a', key: 'a' },
      { file: '/project/a', key: 'a' },
      { file: '/project/b', key: 'b' },
    ])
    spares.take(0, false)

    expect(listRunning()).toStrictEqual(['a'])
    expect(spares.take(1, true)).toBeNull()
    expect(vi.mocked(stopProcessGroup).mock.calls).toStrictEqual([[100]])
    expect(spares.take(2, false)).toBe(started[1])
    expect(listRunning()).toStrictEqual(['a', 'b'])
  })

  it('starts no spare without spares in the session', () => {
    let spares = createSpareProcesses(createHandle(0), [
      { file: '/project/a', key: 'a' },
      { file: '/project/a', key: 'a' },
    ])

    expect(spares.take(0, false)).toBeNull()
    expect(spares.take(1, false)).toBeNull()
    expect(startTestProcess).not.toHaveBeenCalled()
  })
})
