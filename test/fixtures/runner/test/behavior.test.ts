import { expect, it, vi } from 'vitest'

function isActive(id: string): boolean {
  let runtime = (globalThis as { __mootant?: { hit(id: string): boolean } })
    .__mootant
  return runtime?.hit(id) === true
}

it('skips', context => {
  if (isActive('skip')) {
    context.skip()
  }
  expect(1).toBe(1)
})

it('fakes timers', async () => {
  vi.useFakeTimers()
  if (isActive('sleep')) {
    await new Promise(() => {})
  }
  vi.useRealTimers()
})

it('snapshots', () => {
  expect('value').toMatchSnapshot()
})
