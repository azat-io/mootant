import { expect, it } from 'vitest'

import { LIMIT } from '../src/limits'

it('has a limit', () => {
  expect(LIMIT).toBe(12)
})
