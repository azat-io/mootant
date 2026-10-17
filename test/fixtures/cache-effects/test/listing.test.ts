import { expect, it } from 'vitest'

import { count } from '../src/listing'

it('counts the variables', () => {
  expect(count(Object.keys({ ...process.env }))).toBe(1)
})
