import { afterEach, describe, expect, it, vi } from 'vitest'

import type { JestProjectConfig } from '../../../adapters/jest/types/jest-project-config'
import type { HostTest } from '../../../adapters/jest/types/host-test'

import MootantHostRunner from '../../../adapters/jest/runner'

/**
 * How `process.connected` was before the tests, put back after each.
 */
let connected = Object.getOwnPropertyDescriptor(process, 'connected')

/**
 * Global configuration Jest makes the runner with in these tests.
 */
const GLOBAL_CONFIG = {
  testSequencer: '/sequencer.js',
  detectOpenHandles: false,
  maxWorkers: 2,
}

/**
 * Starts the runner with the listeners and the channel of this process stubbed,
 * since Vitest's own worker uses them.
 *
 * @param tests - Test files Jest hands the runner.
 * @returns What the runner sent, its promise, and its listeners by event.
 */
function run(tests: HostTest[]): {
  listeners: Map<string, (message?: unknown) => void>
  parked: Promise<void>
  sent: unknown[]
} {
  let listeners = new Map<string, (message?: unknown) => void>()
  let sent: unknown[] = []
  vi.spyOn(process, 'on').mockImplementation(((
    event: string,
    listener: (message?: unknown) => void,
  ) => {
    listeners.set(event, listener)
    return process
  }) as typeof process.on)
  vi.spyOn(process, 'send').mockImplementation(message => {
    sent.push(message)
    return true
  })
  let runner = new MootantHostRunner(GLOBAL_CONFIG)
  let parked = runner.runTests(tests)
  vi.restoreAllMocks()
  return { listeners, parked, sent }
}

/**
 * Creates a test file of a project as Jest hands it to a runner.
 *
 * @param id - Id of the project.
 * @param file - Path of the test file.
 * @returns The test file.
 */
function createTest(id: string, file: string): HostTest {
  return {
    context: {
      moduleMap: { toJSON: () => ({ rootDir: `/${id}`, mocks: [] }) },
      config: { id } as JestProjectConfig,
    },
    path: file,
  }
}

/**
 * Tells whether a promise has settled once the event loop has turned.
 *
 * @param promise - Promise to look at.
 * @returns Whether it settled.
 */
async function isSettled(promise: Promise<void>): Promise<boolean> {
  let settled = false
  void promise.then(() => {
    settled = true
  })
  await new Promise(resolve => {
    setImmediate(resolve)
  })
  return settled
}

/**
 * Sets whether the channel of this process lives.
 *
 * @param value - Whether it does.
 */
function setConnected(value: boolean): void {
  Object.defineProperty(process, 'connected', { configurable: true, value })
}

describe('mootantHostRunner', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    if (connected === undefined) {
      Reflect.deleteProperty(process, 'connected')
    } else {
      Object.defineProperty(process, 'connected', connected)
    }
  })

  it('says it runs serially', () => {
    let runner = new MootantHostRunner(GLOBAL_CONFIG)

    expect(runner.isSerial).toBe(true)
  })

  it('sends ready with what workers need', () => {
    setConnected(true)
    let { sent } = run([
      createTest('a', '/a/1.test.js'),
      createTest('a', '/a/2.test.js'),
      createTest('b', '/b/1.test.js'),
    ])

    expect(sent).toStrictEqual([
      {
        tests: [
          { path: '/a/1.test.js', project: 'a' },
          { path: '/a/2.test.js', project: 'a' },
          { path: '/b/1.test.js', project: 'b' },
        ],
        moduleMaps: {
          a: { rootDir: '/a', mocks: [] },
          b: { rootDir: '/b', mocks: [] },
        },
        configs: { a: { id: 'a' }, b: { id: 'b' } },
        loaded: Object.keys(require.cache),
        globalConfig: GLOBAL_CONFIG,
        umask: process.umask(),
        cwd: process.cwd(),
        env: process.env,
        type: 'ready',
      },
    ])
  })

  it('stays parked until close', async () => {
    setConnected(true)
    let { listeners, parked } = run([])

    listeners.get('message')!({ type: 'other' })

    await expect(isSettled(parked)).resolves.toBe(false)

    listeners.get('message')!({ type: 'close' })

    await expect(isSettled(parked)).resolves.toBe(true)
  })

  it('ends when the channel closes, so that global teardown runs', async () => {
    setConnected(true)
    let { listeners, parked } = run([])

    listeners.get('disconnect')!()

    await expect(isSettled(parked)).resolves.toBe(true)
  })

  it('ends at once when the channel closed before Jest got here, sending nothing', async () => {
    setConnected(false)
    let { listeners, parked, sent } = run([])

    await expect(isSettled(parked)).resolves.toBe(true)
    expect(sent).toStrictEqual([])
    expect(listeners.size).toBe(0)
  })
})
