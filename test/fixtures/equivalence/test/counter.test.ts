import { expect, it } from 'vitest'

import { bump, read } from '../src/counter'

it('bumps', () => {
  bump()
})

it('has bumped once', () => {
  expect(read()).toBe(1)
})
