import { expect, test, vi } from 'vitest'

import { loadActual } from './actual.js'
import { greet } from '../src/service.js'

vi.mock('../src/api.js', async () => {
  let actual = await loadActual('../src/api.js')
  return { ...actual }
})

test('admin greeting through the real api', async () => {
  expect(await greet(1)).toBe('Welcome back, user1!')
  expect(await greet(2)).toBe('Hello, user2!')
})
