import { expect, it, vi } from 'vitest'

import { consume } from '../src/consume.js'

it('takes the item', () => {
  let queue = [1, 2]
  consume(queue, false, () => {})
  expect(queue).toEqual([2])
})

it('waits until ready', () => {
  let onItem = vi.fn()
  consume([1], false, onItem)
  expect(onItem).not.toHaveBeenCalled()
})
