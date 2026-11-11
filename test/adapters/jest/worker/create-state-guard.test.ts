import { describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import { promises } from 'node:fs'

import { createStateGuard } from '../../../../adapters/jest/worker/create-state-guard'

/**
 * The core modules of the baseline, sorted.
 */
const CORE_MODULES = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'crypto',
  'dns',
  'events',
  'fs',
  'fs/promises',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'readline',
  'stream',
  'string_decoder',
  'timers',
  'tty',
  'url',
  'util',
  'vm',
  'worker_threads',
  'zlib',
]

/**
 * A process with fake modules and resources a test can change.
 */
interface FakeProcess {
  /**
   * What the guard reads.
   */
  process: Parameters<typeof createStateGuard>[0]['process']

  /**
   * Moves the working directory.
   */
  chdir(directory: string): void

  /**
   * Changes the mask of new files.
   */
  setMask(value: number): void

  /**
   * Fake core module by name.
   */
  modules: Map<string, object>

  /**
   * Resources the process lists.
   */
  resources: string[]
}

/**
 * Creates a process in which every core module is an empty object. Reading
 * `stdout` or `stderr` opens a pipe, which the process then lists.
 *
 * @returns The fake process.
 */
function createProcess(): FakeProcess {
  let modules = new Map(CORE_MODULES.map(name => [name, {}]))
  let resources: string[] = []
  let directory = '/work'
  let mask = 0o022
  return {
    process: {
      get stdout() {
        resources.push('PipeWrap')
        return null
      },
      get stderr() {
        resources.push('PipeWrap')
        return null
      },
      getBuiltinModule: name => modules.get(name),
      getActiveResourcesInfo: () => resources,
      cwd: () => directory,
      umask: () => mask,
    },
    chdir(next) {
      directory = next
    },
    setMask(value) {
      mask = value
    },
    resources,
    modules,
  }
}

/**
 * Takes a baseline of a fake process, and gives its check with turns that run
 * at once.
 *
 * @param fake - The process.
 * @returns The check.
 */
function createGuard(fake: FakeProcess): () => Promise<string[]> {
  return createStateGuard({
    setImmediate(callback) {
      callback()
    },
    process: fake.process,
  })
}

describe('createStateGuard', () => {
  it('reads the core modules', async () => {
    let names: string[] = []
    let fake = createProcess()
    let guard = createGuard({
      ...fake,
      process: {
        ...fake.process,
        getBuiltinModule(name) {
          names.push(name)
          return {}
        },
      },
    })

    expect(names).toStrictEqual(CORE_MODULES)
    await expect(guard()).resolves.toStrictEqual([])
  })

  it('finds nothing in a clean worker', async () => {
    let fake = createProcess()
    fake.modules.set('fs', { readFile() {} })
    fake.resources.push('TCPServerWrap')
    let guard = createGuard(fake)

    await expect(guard()).resolves.toStrictEqual([])
  })

  it('reports a wrapped function', async () => {
    let fake = createProcess()
    let fs = { readFile() {} }
    fake.modules.set('fs', fs)
    let guard = createGuard(fake)
    fs.readFile = () => {}

    await expect(guard()).resolves.toStrictEqual(['fs.readFile'])
  })

  it('reports a new key, with a symbol written as its text', async () => {
    let fake = createProcess()
    let path = {}
    fake.modules.set('path', path)
    let guard = createGuard(fake)
    Object.assign(path, { [Symbol.for('mark')]: 1, added: 1 })

    await expect(guard()).resolves.toStrictEqual([
      'path.Symbol(mark)',
      'path.added',
    ])
  })

  it('reports a deleted key', async () => {
    let fake = createProcess()
    let os = { hostname: 'a' }
    fake.modules.set('os', os)
    let guard = createGuard(fake)
    Reflect.deleteProperty(os, 'hostname')

    await expect(guard()).resolves.toStrictEqual(['os.hostname'])
  })

  it('reports a changed getter and a changed setter', async () => {
    let fake = createProcess()
    let utility = {
      get writer() {
        return 1
      },
      get reader() {
        return 1
      },
      set writer(_value: number) {},
    }
    fake.modules.set('util', utility)
    let guard = createGuard(fake)
    let { get } = Object.getOwnPropertyDescriptor(utility, 'writer')!
    Object.defineProperties(utility, {
      writer: {
        set(_value: number) {},
        get,
      },
      reader: { get: () => 1 },
    })

    await expect(guard()).resolves.toStrictEqual(['util.reader', 'util.writer'])
  })

  it('takes no change from a lazy getter that replaced itself with what it returns', async () => {
    let fake = createProcess()
    let value = { lazy: true }
    let crypto = {
      get webcrypto() {
        return value
      },
    }
    fake.modules.set('crypto', crypto)
    let guard = createGuard(fake)
    Object.defineProperty(crypto, 'webcrypto', { writable: true, value })

    await expect(guard()).resolves.toStrictEqual([])
  })

  it('reports a getter replaced by something it does not return', async () => {
    let fake = createProcess()
    let crypto = {
      get webcrypto() {
        return { lazy: true }
      },
    }
    fake.modules.set('crypto', crypto)
    let guard = createGuard(fake)
    Object.defineProperty(crypto, 'webcrypto', { value: { other: true } })

    await expect(guard()).resolves.toStrictEqual(['crypto.webcrypto'])
  })

  it('reports a getter returning nothing replaced by another getter', async () => {
    let fake = createProcess()
    let crypto = Object.defineProperty({}, 'webcrypto', {
      configurable: true,
      get: () => {},
    })
    fake.modules.set('crypto', crypto)
    let guard = createGuard(fake)
    Object.defineProperty(crypto, 'webcrypto', {
      get: () => {},
    })

    await expect(guard()).resolves.toStrictEqual(['crypto.webcrypto'])
  })

  it('reports a value replaced by a getter', async () => {
    let fake = createProcess()
    let net = { connect: 1 }
    fake.modules.set('net', net)
    let guard = createGuard(fake)
    Object.defineProperty(net, 'connect', { get: () => 1 })

    await expect(guard()).resolves.toStrictEqual(['net.connect'])
  })

  it('reports a changed working directory', async () => {
    let fake = createProcess()
    let guard = createGuard(fake)
    fake.chdir('/elsewhere')

    await expect(guard()).resolves.toStrictEqual(['cwd'])
  })

  it('reports a changed mask of new files', async () => {
    let fake = createProcess()
    let guard = createGuard(fake)
    fake.setMask(0o077)

    await expect(guard()).resolves.toStrictEqual(['umask'])
  })

  it('takes no change from a mask set back', async () => {
    let fake = createProcess()
    let guard = createGuard(fake)
    fake.setMask(0o077)
    fake.setMask(0o022)

    await expect(guard()).resolves.toStrictEqual([])
  })

  it('reports a resource left, as a rise over the baseline', async () => {
    let fake = createProcess()
    fake.resources.push('TCPServerWrap')
    let guard = createGuard(fake)
    fake.resources.push('TCPServerWrap', 'TCPServerWrap', 'ProcessWrap')

    await expect(guard()).resolves.toStrictEqual([
      'ProcessWrap +1',
      'TCPServerWrap +2',
    ])
  })

  it('counts pipes and pipe servers apart, and ignores other kinds', async () => {
    let fake = createProcess()
    let guard = createGuard(fake)
    fake.resources.push(
      'PipeWrap',
      'PipeServerWrap',
      'Timeout',
      'FSReqCallback',
    )

    await expect(guard()).resolves.toStrictEqual([
      'PipeServerWrap +1',
      'PipeWrap +1',
    ])
  })

  it('takes no change from a count that fell', async () => {
    let fake = createProcess()
    fake.resources.push('TCPServerWrap', 'ProcessWrap')
    let guard = createGuard(fake)
    fake.resources.length = 0

    await expect(guard()).resolves.toStrictEqual([])
  })

  it('has the pipes of stdout and stderr in the baseline', async () => {
    let fake = createProcess()
    let guard = createGuard(fake)

    expect(fake.resources).toStrictEqual(['PipeWrap', 'PipeWrap'])
    await expect(guard()).resolves.toStrictEqual([])
  })

  it('gives every reason, sorted by code unit', async () => {
    let fake = createProcess()
    let zlib = {}
    let assert = {}
    fake.modules.set('zlib', zlib)
    fake.modules.set('assert', assert)
    let guard = createGuard(fake)
    Object.assign(zlib, { b: 1 })
    Object.assign(zlib, { B: 1 })
    Object.assign(assert, { a: 1 })
    fake.chdir('/elsewhere')
    fake.setMask(0o077)
    fake.resources.push('ProcessWrap')

    await expect(guard()).resolves.toStrictEqual([
      'ProcessWrap +1',
      'assert.a',
      'cwd',
      'umask',
      'zlib.B',
      'zlib.b',
    ])
  })

  it('reads only after two turns, so a server closed during them counts as closed', async () => {
    let fake = createProcess()
    let turns: (() => void)[] = []
    let guard = createStateGuard({
      setImmediate(callback) {
        turns.push(callback)
      },
      process: fake.process,
    })
    fake.resources.push('TCPServerWrap')
    let settled = false

    /**
     * Runs the check and notes when it has settled.
     *
     * @returns What the check found.
     */
    async function check(): Promise<string[]> {
      let found = await guard()
      settled = true
      return found
    }

    let reasons = check()

    expect(turns).toHaveLength(1)

    turns[0]!()
    await Promise.resolve()
    await Promise.resolve()

    expect(turns).toHaveLength(2)
    expect(settled).toBe(false)

    fake.resources.length = 2
    turns[1]!()

    await expect(reasons).resolves.toStrictEqual([])
    expect(turns).toHaveLength(2)
  })

  describe('with the real process', () => {
    it('reads the real modules clean, and a real server left as a resource', async () => {
      let guard = createStateGuard({ setImmediate, process })

      await expect(guard()).resolves.toStrictEqual([])

      let server = createServer()
      await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve)
      })

      await expect(guard()).resolves.toStrictEqual(['TCPServerWrap +1'])

      server.close()

      await expect(guard()).resolves.toStrictEqual([])
    })

    it('reads a mask left changed, and clean once it is set back', async () => {
      let guard = createStateGuard({ setImmediate, process })
      let mask = process.umask(0o077)
      let reasons = await guard()
      process.umask(mask)

      expect(reasons).toStrictEqual(['umask'])
      await expect(guard()).resolves.toStrictEqual([])
    })

    it('reports a stand-in left on fs.promises, which is fs/promises', async () => {
      let guard = createStateGuard({ setImmediate, process })
      let { readFile } = promises
      Reflect.set(promises, 'readFile', () => {})
      let reasons = await guard()
      Reflect.set(promises, 'readFile', readFile)

      expect(reasons).toStrictEqual(['fs/promises.readFile'])
    })
  })
})
