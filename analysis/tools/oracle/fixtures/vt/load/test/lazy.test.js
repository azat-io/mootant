import { expect, test, vi } from 'vitest'

test('lazy import inside a test', async () => {
  let { lazyValue } = await import('../src/lazy.js')
  expect(lazyValue()).toBe(14)
})

test('fresh lazy import after resetModules', async () => {
  vi.resetModules()
  let { LAZY } = await import('../src/lazy.js')
  expect(LAZY).toBe(15)
})
