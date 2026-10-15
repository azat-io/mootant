import { expect, it } from 'vitest'

import { read } from '../src/read'

it('reads zero', () => {
  expect(read()).toBe(0)
})
