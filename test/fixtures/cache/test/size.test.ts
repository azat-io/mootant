import { expect, it } from 'vitest'

import { double, label } from '../src/size'

it('doubles', () => {
  expect(double(2)).toMatchSnapshot()
})

it('labels big values', () => {
  expect(label(20)).toBe('big')
})
