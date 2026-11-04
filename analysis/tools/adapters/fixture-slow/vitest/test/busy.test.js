import { it } from 'vitest'

import '../src/price.js'

it('spins synchronously for 5 s', () => {
  let end = Date.now() + 5000
  while (Date.now() < end) {}
})
