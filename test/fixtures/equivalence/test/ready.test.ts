import { expect, it } from 'vitest'

import { isReady, init } from '../src/ready'

it('is ready after init', () => {
  init()
  expect(isReady()).toBe(true)
})
