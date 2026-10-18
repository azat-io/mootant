import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureClock } from '../../../adapters/shared/capture-clock'

describe('captureClock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the real timers after fake timers are installed', async () => {
    let clock = captureClock()
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'setImmediate',
        'performance',
        'Date',
      ],
    })
    vi.setSystemTime(new Date('2000-01-01'))
    let started = clock.now()
    let fired = await new Promise<string>(resolve => {
      let cancelled = clock.setTimeout(() => {
        resolve('cancelled')
      }, 1)
      clock.clearTimeout(cancelled)
      clock.setTimeout(() => {
        resolve('timeout')
      }, 5)
    })
    let immediate = await new Promise<string>(resolve => {
      clock.setImmediate(() => {
        resolve('immediate')
      })
    })

    expect(fired).toBe('timeout')
    expect(immediate).toBe('immediate')
    expect(clock.now()).toBeGreaterThan(started)
    expect(vi.getTimerCount()).toBe(0)
  })
})
