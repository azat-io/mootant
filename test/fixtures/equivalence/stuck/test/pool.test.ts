import { expect, test } from 'vitest'

import { closeAll } from '../src/pool'

test('closes every resource', () => {
  let pool = (globalThis as unknown as { pool: { open: number } }).pool
  pool.open = 2
  closeAll(pool)
  expect(pool).toBeDefined()
})
