import { expect, it, vi } from 'vitest'

import { remove } from '../src/remove.js'

it('removes the key', () => {
  let map = new Map([['a', 1]])
  remove(map, 'a', () => {})
  expect(map.has('a')).toBe(false)
})

it('does not report a missing key', () => {
  let onRemove = vi.fn()
  remove(new Map(), 'b', onRemove)
  expect(onRemove).not.toHaveBeenCalled()
})
