import { expect, it } from 'vitest'

import { bump, read } from '../src/counter'

it('bumps', () => {
  bump()
})

it('has bumped', () => {
  expect(read()).toBeGreaterThan(0)
})
