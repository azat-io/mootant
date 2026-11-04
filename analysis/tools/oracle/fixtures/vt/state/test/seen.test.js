import { expect, test } from 'vitest'

import { clear, track } from '../src/seen.js'

test('tracks a fresh id', () => {
  clear()
  expect(track('x')).toBe(true)
})
