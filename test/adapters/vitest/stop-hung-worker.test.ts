import { afterEach, describe, expect, it, vi } from 'vitest'
import { execFile } from 'node:child_process'

import { stopHungWorker } from '../../../adapters/vitest/stop-hung-worker'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return {
    ...actual,
    execFile: vi.fn(actual.execFile) as never,
  }
})

/**
 * Makes `ps` report a parent process.
 *
 * @param stdout - Output of `ps`, or null for a failure.
 */
function mockParent(stdout: string | null): void {
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _arguments: string[],
    callback: (error: Error | null, stdout: string) => void,
  ) => {
    callback(stdout === null ? new Error('gone') : null, stdout ?? '')
  }) as never)
}

describe('stopHungWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('stops a live child process', async () => {
    let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    mockParent(` ${process.pid}\n`)

    await expect(stopHungWorker(4242)).resolves.toBe(true)
    expect(kill).toHaveBeenCalledWith(4242, 0)
    expect(kill).toHaveBeenCalledWith(4242, 'SIGKILL')
    expect(execFile).toHaveBeenCalledWith(
      'ps',
      ['-o', 'ppid=', '-p', '4242'],
      expect.any(Function),
    )
  })

  it('leaves processes that are gone or not its children', async () => {
    let kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('gone'), { code: 'ESRCH' })
    })

    await expect(stopHungWorker(4242)).resolves.toBe(false)

    kill.mockReturnValue(true)
    mockParent('1\n')

    await expect(stopHungWorker(4242)).resolves.toBe(false)

    mockParent(null)

    await expect(stopHungWorker(4242)).resolves.toBe(false)
    expect(kill).not.toHaveBeenCalledWith(4242, 'SIGKILL')
  })

  it('handles a process that ends before the signal', async () => {
    mockParent(String(process.pid))
    let kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        throw Object.assign(new Error('gone'), { code: 'ESRCH' })
      }
      return true
    })

    await expect(stopHungWorker(4242)).resolves.toBe(false)

    kill.mockImplementation((_pid, signal) => {
      if (signal === 'SIGKILL') {
        throw Object.assign(new Error('denied'), { code: 'EPERM' })
      }
      return true
    })

    await expect(stopHungWorker(4242)).rejects.toThrow('denied')
  })

  it('skips the parent check on Windows', async () => {
    let platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    vi.spyOn(process, 'kill').mockReturnValue(true)
    vi.mocked(execFile).mockClear()

    await expect(stopHungWorker(4242)).resolves.toBe(true)
    expect(execFile).not.toHaveBeenCalled()

    platform.mockRestore()
  })
})
