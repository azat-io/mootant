import { expect, test } from 'vitest'

import { plural } from '../src/format.js'

test.fails('expected to fail', () => {
  expect(plural(1, 'fox')).toBe('foxs')
})
