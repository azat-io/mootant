import { describe, expect, test } from 'vitest'

import { formatPrice, wait } from '../src/format.js'

describe.concurrent('prices', () => {
  test('one fifty', async () => {
    await wait(20)
    expect(formatPrice(150)).toBe('$1.50')
  })
  test('zero', async () => {
    await wait(10)
    expect(formatPrice(0)).toBe('$0.00')
  })
  test('cents', async () => {
    await wait(5)
    expect(formatPrice(7)).toBe('$0.07')
  })
})
