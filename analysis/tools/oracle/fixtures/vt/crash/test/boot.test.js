import { expect, test } from 'vitest'

import { mode } from '../src/boot.js'

test('mode', () => {
  expect(mode()).toBe('test')
})
