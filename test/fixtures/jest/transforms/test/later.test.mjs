import { when } from '../src/later.mjs'

test('reads the text of an async transformer', () => {
  expect(when(5)).toBe('later')
  expect(when(0)).toBe('now')
})
