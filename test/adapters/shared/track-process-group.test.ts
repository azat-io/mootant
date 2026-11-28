import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIVE_PROCESS_GROUPS } from '../../../adapters/shared/live-process-groups'
import { trackProcessGroup } from '../../../adapters/shared/track-process-group'

/**
 * Counts the listeners of this process for the exit and the signals.
 *
 * @returns Listeners of `exit`, `SIGHUP`, `SIGINT`, `SIGQUIT` and `SIGTERM`.
 */
function countListeners(): number[] {
  return ['exit', 'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGTERM'].map(event =>
    process.listenerCount(event),
  )
}

describe('trackProcessGroup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    LIVE_PROCESS_GROUPS.clear()
  })

  it('listens while a process is remembered', () => {
    let before = countListeners()
    let first = trackProcessGroup(41)
    let second = trackProcessGroup(42)

    expect(countListeners()).toStrictEqual(before.map(count => count + 1))
    expect([...LIVE_PROCESS_GROUPS]).toStrictEqual([41, 42])

    first()

    expect(countListeners()).toStrictEqual(before.map(count => count + 1))

    second()

    expect(countListeners()).toStrictEqual(before)
    expect(LIVE_PROCESS_GROUPS.size).toBe(0)
  })

  it('stops the processes when this process exits', () => {
    let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    let untrack = trackProcessGroup(41)
    process.emit('exit', 0)

    expect(kill.mock.calls).toStrictEqual([[-41, 'SIGKILL']])

    untrack()
  })

  it.each(['SIGHUP', 'SIGINT', 'SIGQUIT'] as const)(
    'stops the processes on %s and raises it again alone',
    signal => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
      let before = countListeners()
      let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
      let listeners = process.listeners(signal)
      process.removeAllListeners(signal)
      trackProcessGroup(41)
      process.emit(signal, signal)
      for (let listener of listeners) {
        process.on(signal, listener)
      }

      expect(kill.mock.calls).toStrictEqual([
        [-41, 'SIGKILL'],
        [process.pid, signal],
      ])
      expect(countListeners()).toStrictEqual(before)
    },
  )

  it.each(['SIGHUP', 'SIGQUIT'] as const)(
    'stops the processes on %s and raises SIGINT in its place alone on Windows',
    signal => {
      vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
      let before = countListeners()
      let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
      let listeners = process.listeners(signal)
      process.removeAllListeners(signal)
      trackProcessGroup(41)
      process.emit(signal, signal)
      for (let listener of listeners) {
        process.on(signal, listener)
      }

      expect(kill.mock.calls).toStrictEqual([
        [-41, 'SIGKILL'],
        [process.pid, 'SIGINT'],
      ])
      expect(countListeners()).toStrictEqual(before)
    },
  )

  it('leaves a signal to other listeners', () => {
    let kill = vi.spyOn(process, 'kill').mockReturnValue(true)
    let other = vi.fn<(signal: string) => void>()
    process.on('SIGTERM', other)
    trackProcessGroup(41)
    process.emit('SIGTERM', 'SIGTERM')
    process.off('SIGTERM', other)

    expect(kill.mock.calls).toStrictEqual([[-41, 'SIGKILL']])
    expect(other).toHaveBeenCalledExactlyOnceWith('SIGTERM')
  })
})
