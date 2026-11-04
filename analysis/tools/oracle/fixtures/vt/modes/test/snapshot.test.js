import { expect, test } from 'vitest'

import { formatPrice, plural, range } from '../src/format.js'

test('file snapshot', () => {
  expect(formatPrice(1999)).toMatchSnapshot()
})

test('inline snapshot', () => {
  expect(plural(2, 'item')).toMatchInlineSnapshot(`"items"`)
})

test('snapshot per item', () => {
  for (let count of range(2)) {
    expect(plural(count, 'box')).toMatchSnapshot()
  }
})
