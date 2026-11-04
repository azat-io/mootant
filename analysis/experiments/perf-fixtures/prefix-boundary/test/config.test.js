import { expect, test } from 'vitest'

import { getConfig } from '../src/config.js'

// Only this test builds the configuration, so only it reaches the mutants of
// createConfig in the dry run; the later tests read the cached object.
test('loads a configuration', () => {
  expect(getConfig()).toBeTypeOf('object')
})

test('retries three times', () => {
  expect(getConfig().retries).toBe(3)
})

test('is strict', () => {
  expect(getConfig().mode).toBe('strict')
})

test('waits two seconds', () => {
  expect(getConfig().timeout).toBe(2000)
})
