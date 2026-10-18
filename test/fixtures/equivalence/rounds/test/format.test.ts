import { expect, it } from 'vitest'

import { format } from '../src/format'

it('formats', () => {
  expect(format(3)).toBe('6px')
})
