import { expect, test } from 'vitest'

import { acquire } from '../src/pool'

test('acquires and forgets to release', () => {
  let pool = (globalThis as unknown as { pool: { open: number } }).pool
  acquire(pool)
  expect(pool.open).toBeGreaterThan(0)
})
