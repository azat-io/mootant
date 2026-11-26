import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { removeLiveWorkDirectories } from '../../core/run/remove-live-work-directories'
import { watchInterrupts } from '../../cli/watch-interrupts'

vi.mock(import('../../core/run/remove-live-work-directories'), () => ({
  removeLiveWorkDirectories: vi.fn<() => void>(),
}))

/**
 * Signals the watch listens to.
 */
const SIGNALS = ['SIGHUP', 'SIGINT', 'SIGTERM'] as const

/**
 * Real descriptor of the platform, restored after every test.
 */
let realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!

/**
 * Counts the listeners of this process for the signals.
 *
 * @returns Listeners of `SIGHUP`, `SIGINT` and `SIGTERM`.
 */
function countListeners(): number[] {
  return SIGNALS.map(signal => process.listenerCount(signal))
}

describe('watchInterrupts', () => {
  let saved = new Map<NodeJS.Signals, NodeJS.SignalsListener[]>()
  let errorListeners: unknown[] = []
  let exitListeners: unknown[] = []

  beforeEach(() => {
    vi.spyOn(process, 'kill').mockReturnValue(true)
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    errorListeners = process.stderr.listeners('error')
    exitListeners = process.listeners('exit')
    for (let signal of SIGNALS) {
      saved.set(signal, process.listeners(signal) as NodeJS.SignalsListener[])
      process.removeAllListeners(signal)
    }
  })

  afterEach(() => {
    for (let [signal, listeners] of saved) {
      process.removeAllListeners(signal)
      for (let listener of listeners) {
        process.on(signal, listener)
      }
    }
    saved.clear()
    for (let listener of process.stderr.listeners('error')) {
      if (!errorListeners.includes(listener)) {
        process.stderr.off('error', listener as () => void)
      }
    }
    for (let listener of process.listeners('exit')) {
      if (!exitListeners.includes(listener)) {
        process.off('exit', listener)
      }
    }
    Object.defineProperty(process, 'platform', realPlatform)
    process.exitCode = undefined
    vi.mocked(removeLiveWorkDirectories).mockClear()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('aborts on the first signal with its exit code and ignores later ones', () => {
    let watch = watchInterrupts()
    let onAbort = vi.fn<() => void>()
    watch.signal.addEventListener('abort', onAbort)

    expect(countListeners()).toStrictEqual([1, 1, 1])

    process.emit('SIGTERM', 'SIGTERM')
    process.emit('SIGINT', 'SIGINT')

    expect(watch.signal.aborted).toBe(true)
    expect(onAbort).toHaveBeenCalledExactlyOnceWith(expect.any(Event))
    expect(process.exitCode).toBe(143)
    expect(process.kill).not.toHaveBeenCalled()

    expect(watch.end()).toBe(true)
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGTERM')
  })

  it.each([
    { signal: 'SIGHUP', code: 129 },
    { signal: 'SIGINT', code: 130 },
    { signal: 'SIGTERM', code: 143 },
  ] as const)(
    'ends the process by $signal once the watch ends, else with exit code $code',
    ({ signal, code }) => {
      let watch = watchInterrupts()
      process.emit(signal, signal)

      expect(watch.end()).toBe(true)
      expect(process.kill).toHaveBeenCalledExactlyOnceWith(process.pid, signal)
      expect(process.exit).toHaveBeenCalledExactlyOnceWith()
      expect(vi.mocked(process.kill).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(process.exit).mock.invocationCallOrder[0]!,
      )
      expect(process.exitCode).toBe(code)
      expect(countListeners()).toStrictEqual([0, 0, 0])
    },
  )

  it('ends the process with the exit code alone where a signal cannot be raised again', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    let watch = watchInterrupts()
    process.emit('SIGINT', 'SIGINT')

    expect(watch.end()).toBe(true)
    expect(process.kill).not.toHaveBeenCalled()
    expect(process.exit).toHaveBeenCalledExactlyOnceWith()
    expect(process.exitCode).toBe(130)
  })

  it('removes the work directories and ends the process once the cleanup ran out of time', () => {
    vi.useFakeTimers()
    watchInterrupts()
    process.emit('SIGHUP', 'SIGHUP')
    vi.advanceTimersByTime(4999)

    expect(removeLiveWorkDirectories).not.toHaveBeenCalled()
    expect(process.kill).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(removeLiveWorkDirectories).toHaveBeenCalledExactlyOnceWith()
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGHUP')
    expect(
      vi.mocked(removeLiveWorkDirectories).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(process.kill).mock.invocationCallOrder[0]!)
    expect(process.exit).toHaveBeenCalledExactlyOnceWith()
    expect(countListeners()).toStrictEqual([0, 0, 0])
  })

  it('keeps no time limit once the watch ended', () => {
    vi.useFakeTimers()
    let watch = watchInterrupts()
    process.emit('SIGINT', 'SIGINT')
    watch.end()
    vi.advanceTimersByTime(5000)

    expect(removeLiveWorkDirectories).not.toHaveBeenCalled()
    expect(process.kill).toHaveBeenCalledExactlyOnceWith(process.pid, 'SIGINT')
  })

  it('removes the work directories when something else ends the process', () => {
    watchInterrupts()
    process.emit('exit', 0)

    expect(removeLiveWorkDirectories).toHaveBeenCalledExactlyOnceWith(0)
  })

  it('only removes its listeners when no signal came', () => {
    let errors = process.stderr.listenerCount('error')
    let watch = watchInterrupts()

    expect(process.stderr.listenerCount('error')).toBe(errors + 1)
    expect(process.listeners('exit')).toContain(removeLiveWorkDirectories)

    expect(watch.end()).toBe(false)
    expect(watch.end()).toBe(false)
    expect(watch.signal.aborted).toBe(false)
    expect(process.kill).not.toHaveBeenCalled()
    expect(process.exit).not.toHaveBeenCalled()
    expect(process.exitCode).toBeUndefined()
    expect(countListeners()).toStrictEqual([0, 0, 0])
    expect(process.stderr.listenerCount('error')).toBe(errors)
    expect(process.listeners('exit')).not.toContain(removeLiveWorkDirectories)
  })

  it('ignores failed writes to standard error, after a signal too', () => {
    let errors = process.stderr.listenerCount('error')
    let watch = watchInterrupts()

    expect(() =>
      process.stderr.emit('error', new Error('write EIO')),
    ).not.toThrow()

    process.emit('SIGHUP', 'SIGHUP')
    watch.end()

    expect(() =>
      process.stderr.emit('error', new Error('write EIO')),
    ).not.toThrow()
    expect(process.stderr.listenerCount('error')).toBe(errors + 1)
  })
})
