import { expect, it } from 'vitest'

import { walk } from '../lib/walk.js'

it('walks to n', () => {
  expect(walk(3)).toBe(3)
})
