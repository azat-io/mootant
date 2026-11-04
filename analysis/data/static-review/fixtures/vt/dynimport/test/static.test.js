import { test } from 'vitest'

import { add } from '../src/math.js'

// Imports the module statically and checks nothing.
test('add runs', () => {
  add(1, 1)
})
