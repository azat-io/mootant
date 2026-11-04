import { expect, test } from 'vitest'

test('greeting from the setup file', () => {
  expect(globalThis.oracleGreeting).toBe('Hi setup')
})
