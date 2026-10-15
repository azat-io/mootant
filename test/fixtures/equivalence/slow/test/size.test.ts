import { beforeEach, beforeAll, expect, it } from 'vitest'

import { size } from '../src/size'

/**
 * Waits like a slow setup, such as a container or a database.
 *
 * @returns Resolves after 400 ms.
 */
function settle(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 400)
  })
}

beforeAll(settle)

beforeEach(settle)

it('has a size', { timeout: 100 }, () => {
  expect(size()).toBe(3)
})
