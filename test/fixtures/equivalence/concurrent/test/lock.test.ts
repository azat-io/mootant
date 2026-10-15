import { describe, expect, it } from 'vitest'

import { exclusive } from '../src/lock'

/**
 * Waits long enough for the other test to ask for the lock.
 *
 * @returns Resolves after 30 ms.
 */
function wait(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 30)
  })
}

describe.concurrent('lock', () => {
  it('lets the first caller in alone', async () => {
    expect(await exclusive(wait)).toBe(1)
  })

  it('lets the second caller in alone', async () => {
    expect(await exclusive(wait)).toBe(1)
  })
})
