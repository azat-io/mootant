import { expect, test, vi } from 'vitest'

import { greet } from '../src/service.js'

vi.mock('../src/api.js', () => ({
  fetchUser: vi.fn(async id => ({ id, name: 'mock' })),
  isAdmin: vi.fn(() => false),
}))

test('greets the mocked user', async () => {
  expect(await greet(1)).toBe('Hello, mock!')
})
