import { expect, test, vi } from 'vitest'

import * as api from '../src/api.js'

vi.mock('../src/api.js', { spy: true })

test('spied isAdmin keeps the original', () => {
  expect(api.isAdmin({ id: 1 })).toBe(true)
  expect(api.isAdmin).toHaveBeenCalledTimes(1)
})
