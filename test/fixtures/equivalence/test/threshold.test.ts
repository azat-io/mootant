import { expect, it } from 'vitest'

import { threshold } from '../src/threshold'

let attempts = 0

it('passes on its retry', { retry: 1 }, () => {
  attempts += 1
  expect(attempts).toBeGreaterThan(threshold())
})
