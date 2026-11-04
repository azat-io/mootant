import { expect, inject, test } from 'vitest'

test('seed from global setup', () => {
  expect(inject('seed')).toBe(42)
})
