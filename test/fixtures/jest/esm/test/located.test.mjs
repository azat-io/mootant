import { locate } from '../src/located.mjs'

test('names its own file and directory', () => {
  expect(locate(0)).toBe('located.mjs')
  expect(locate(1)).toBe('src')
})
