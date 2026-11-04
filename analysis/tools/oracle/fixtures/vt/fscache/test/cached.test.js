import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import { cachedCompute } from '../src/cached.js'

let cache = fileURLToPath(new URL('../.cache', import.meta.url))

test('doubles through the on-disk cache', () => {
  expect(cachedCompute(21, cache)).toBe(42)
})
