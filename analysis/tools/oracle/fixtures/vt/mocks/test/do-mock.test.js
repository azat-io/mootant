import { expect, test, vi } from 'vitest'

test('doMock replaces fetchUser only', async () => {
  vi.doMock('../src/api.js', async importOriginal => ({
    ...(await importOriginal()),
    fetchUser: async id => ({ id, name: 'stub' }),
  }))
  let { greet } = await import('../src/service.js')
  expect(await greet(3)).toBe('Hello, stub!')
  vi.doUnmock('../src/api.js')
})
