import { createRequire } from 'node:module'
import { expect, inject, it } from 'vitest'

import { route } from '../src/route'

let edge = createRequire(import.meta.url)('./edge.cjs') as { value: number }

it('routes', async () => {
  expect(await route(true)).toBe(1)
  expect(inject('seed' as never)).toBe(edge.value)
})
