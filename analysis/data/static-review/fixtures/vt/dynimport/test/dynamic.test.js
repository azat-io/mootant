import { test, expect } from 'vitest'

// Loads the module through a computed specifier, as a test that loads plugins
// or fixtures by name does.
let name = ['math', 'js'].join('.')

test('add', async () => {
  let { add } = await import(`../src/${name}`)
  expect(add(2, 3)).toBe(5)
})
