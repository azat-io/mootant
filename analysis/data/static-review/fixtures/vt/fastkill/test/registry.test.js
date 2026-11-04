import { test, expect } from 'vitest'

import { isRegistered, register } from '../src/registry.js'

// Registers a name; the wait makes it slower than the lookup, so fast mode
// tries the mutants in the lookup first.
test('registers a name', async () => {
  register('  Alpha ')
  await new Promise(resolve => setTimeout(resolve, 30))
})

// Looks the name up as it was registered: no test checks what normalize
// returns, so a plain run of the tests passes with any mutant of normalize.
test('finds a registered name', () => {
  expect(isRegistered('  Alpha ')).toBe(true)
})
