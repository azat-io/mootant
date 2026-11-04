import { test, expect } from 'vitest'

import { greet } from '../src/other.js'

test('greet', () => {
  expect(greet('Ada')).toBe('Hello, Ada')
})
