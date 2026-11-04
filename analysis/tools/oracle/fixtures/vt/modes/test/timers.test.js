import { afterEach, expect, test, vi } from 'vitest'

import { wait, withRetry } from '../src/format.js'

afterEach(() => {
  vi.useRealTimers()
})

test('fake timers resolve wait', async () => {
  vi.useFakeTimers()
  let done = false
  let promise = wait(1000).then(() => {
    done = true
  })
  await vi.advanceTimersByTimeAsync(999)
  expect(done).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await promise
  expect(done).toBe(true)
})

test('retry gives up after the attempts', async () => {
  let calls = 0
  await expect(
    withRetry(() => {
      calls++
      throw new Error('nope')
    }, 2),
  ).rejects.toThrow('nope')
  expect(calls).toBe(2)
})
