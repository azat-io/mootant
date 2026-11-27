import type { MockInstance, Mock } from 'vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile, spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { once } from 'node:events'

import { stopHungWorker } from '../../../adapters/vitest/stop-hung-worker'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return {
    ...actual,
    execFile: vi.fn(actual.execFile) as never,
  }
})

vi.mock(import('node:fs'), async importOriginal => {
  let actual = await importOriginal()
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync) as never,
  }
})

/**
 * Makes `ps` report a parent process or fail.
 *
 * @param result - Output of `ps`, or the error it fails with.
 */
function mockPs(result: string | Error): void {
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _arguments: string[],
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    if (typeof result === 'string') {
      callback(null, result)
    } else {
      callback(result, '')
    }
  }) as never)
}

/**
 * Makes `/proc/<pid>/stat` show a parent process. The name in parentheses holds
 * parentheses and fields of its own, as a process may name itself so.
 *
 * @param parent - Parent process id, or null for a file that cannot be read.
 */
function mockStat(parent: number | null): void {
  vi.mocked(readFileSync).mockImplementation(() => {
    if (parent === null) {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    }
    return `4242 (a) S 1 (b) S ${parent} 4242 4242 0 -1\n`
  })
}

/**
 * Makes the test run as on Linux, with signals that reach a live process.
 *
 * @returns Mock of `process.kill`.
 */
function mockLinux(): MockInstance<typeof process.kill> {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  return vi.spyOn(process, 'kill').mockReturnValue(true)
}

/**
 * Creates a pool that answers whether it stopped a worker.
 *
 * @param stopped - Answer of the pool: null when it cannot tell its workers.
 * @returns Pool whose `stopWorker` gives the answer.
 */
function createPool(stopped: boolean | null): {
  stopWorker: Mock<(pid: number) => boolean | null>
} {
  return { stopWorker: vi.fn(() => stopped) }
}

describe('stopHungWorker', () => {
  afterEach(() => {
    vi.resetAllMocks()
    vi.restoreAllMocks()
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  it('leaves a worker to the pool when the pool knows its processes', async () => {
    let kill = mockLinux()

    await expect(stopHungWorker(4242, createPool(true))).resolves.toBe(true)
    await expect(stopHungWorker(4242, createPool(false))).resolves.toBe(false)
    expect(kill).not.toHaveBeenCalled()
    expect(readFileSync).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('stops a live child process when the pool cannot tell', async () => {
    let kill = mockLinux()
    let pool = createPool(null)
    mockStat(process.pid)

    await expect(stopHungWorker(4242, pool)).resolves.toBe(true)
    expect(pool.stopWorker).toHaveBeenCalledExactlyOnceWith(4242)
    expect(kill).toHaveBeenCalledWith(4242, 0)
    expect(kill).toHaveBeenCalledWith(4242, 'SIGKILL')
    expect(readFileSync).toHaveBeenCalledWith('/proc/4242/stat', 'utf8')
    expect(execFile).not.toHaveBeenCalled()
  })

  it('stops a live child process without a working ps', async () => {
    let kill = mockLinux()
    mockStat(process.pid)
    mockPs(Object.assign(new Error('spawn ps ENOENT'), { code: 'ENOENT' }))

    await expect(stopHungWorker(4242, createPool(null))).resolves.toBe(true)

    mockPs(Object.assign(new Error("ps: invalid option -- 'p'"), { code: 1 }))

    await expect(stopHungWorker(4242, createPool(null))).resolves.toBe(true)
    expect(kill).toHaveBeenCalledTimes(4)
    expect(kill).toHaveBeenLastCalledWith(4242, 'SIGKILL')
  })

  it('asks ps where /proc cannot tell the parent', async () => {
    let kill = mockLinux()
    mockStat(null)
    mockPs(` ${process.pid}\n`)

    await expect(stopHungWorker(4242, createPool(null))).resolves.toBe(true)
    expect(kill).toHaveBeenCalledWith(4242, 'SIGKILL')
    expect(execFile).toHaveBeenCalledWith(
      'ps',
      ['-o', 'ppid=', '-p', '4242'],
      expect.any(Function),
    )
  })

  it('leaves processes that are gone, not its children, or of a parent nothing tells', async () => {
    let kill = mockLinux().mockImplementation(() => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    })
    let pool = createPool(null)

    await expect(stopHungWorker(4242, pool)).resolves.toBe(false)

    kill.mockReturnValue(true)
    mockStat(1)

    await expect(stopHungWorker(4242, pool)).resolves.toBe(false)

    mockStat(null)
    mockPs('1\n')

    await expect(stopHungWorker(4242, pool)).resolves.toBe(false)

    mockPs(Object.assign(new Error('spawn ps ENOENT'), { code: 'ENOENT' }))

    await expect(stopHungWorker(4242, pool)).resolves.toBe(false)

    mockPs(Object.assign(new Error("ps: invalid option -- 'p'"), { code: 1 }))

    await expect(stopHungWorker(4242, pool)).resolves.toBe(false)
    expect(kill).not.toHaveBeenCalledWith(4242, 'SIGKILL')
  })

  it('handles a process that ends before the signal', async () => {
    let kill = mockLinux().mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' })
      }
      return true
    })
    mockStat(process.pid)

    await expect(stopHungWorker(4242, createPool(null))).resolves.toBe(false)

    kill.mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        throw Object.assign(new Error('denied'), { code: 'EPERM' })
      }
      return true
    })

    await expect(stopHungWorker(4242, createPool(null))).rejects.toThrow(
      'denied',
    )
  })

  it('skips the parent check on Windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.spyOn(process, 'kill').mockReturnValue(true)

    await expect(stopHungWorker(4242, createPool(null))).resolves.toBe(true)
    expect(readFileSync).not.toHaveBeenCalled()
    expect(execFile).not.toHaveBeenCalled()
  })

  it('stops its live child without ps only where /proc shows the parent', async () => {
    let child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    })
    await once(child, 'spawn')
    let exit = once(child, 'exit')
    let shown = existsSync(`/proc/${child.pid}/stat`)
    vi.stubEnv('PATH', '')
    let stopped: boolean
    try {
      stopped = await stopHungWorker(child.pid!, createPool(null))
    } finally {
      child.kill('SIGKILL')
    }

    expect(stopped).toBe(shown)
    await expect(exit).resolves.toStrictEqual([null, 'SIGKILL'])
  })
})
