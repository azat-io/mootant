import { expect, test } from 'vitest'

import { add } from '../src/add.js'

test('adds', () => {
  // Lists the variables, as code that spreads process.env or starts a child
  // process with it does.
  let variables = { ...process.env }
  expect(Object.keys(variables).length).toBeGreaterThan(0)
  expect(add(2, 3)).toBe(5)
})
