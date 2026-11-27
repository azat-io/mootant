import { expect, inject, it } from 'vitest'

import { add } from '../../src/other'

it('adds, with no URL provided in its project', () => {
  expect(inject('apiUrl' as never)).toBeUndefined()
  expect(add(2, 2)).toBe(4)
})
