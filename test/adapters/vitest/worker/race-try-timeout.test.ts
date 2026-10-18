import { describe, expect, it, vi } from 'vitest'

import { raceTryTimeout } from '../../../../adapters/vitest/worker/race-try-timeout'
import { captureClock } from '../../../../adapters/shared/capture-clock'

describe('raceTryTimeout', () => {
  it('tells whether the timer fired first', async () => {
    let clock = captureClock()
    let clear = vi.spyOn(clock, 'clearTimeout')

    await expect(raceTryTimeout(() => {}, 1000, clock)).resolves.toBe(false)
    await expect(
      raceTryTimeout(() => new Promise(() => {}), 5, clock),
    ).resolves.toBe(true)
    expect(clear).toHaveBeenCalledTimes(2)
  })

  it('rethrows a failure in time and ignores a late one', async () => {
    let clock = captureClock()

    await expect(
      raceTryTimeout(
        () => {
          throw new Error('boom')
        },
        1000,
        clock,
      ),
    ).rejects.toThrow('boom')
    await expect(
      raceTryTimeout(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              reject(new Error('late'))
            }, 20)
          }),
        1,
        clock,
      ),
    ).resolves.toBe(true)
    await new Promise(resolve => {
      setTimeout(resolve, 30)
    })
  })
})
