import { test } from 'vitest'

import { add } from '../src/math.js'

// Reaches `add` but checks nothing.
test('add runs', () => {
  add(1, 1)
})
