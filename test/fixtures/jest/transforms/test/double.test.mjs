import { double } from '../src/via.mjs'
import '../src/blank.mjs'

test('doubles through a module that only passes it on', () => {
  expect(double(2)).toBe(4)
})
