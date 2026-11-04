import { expect, it } from 'vitest'

import { processAll } from '../src/process.js'

it('passes 1-based positions', () => {
  let calls = []
  processAll(['a', 'b'], (item, position) => calls.push([item, position]))
  expect(calls).toEqual([
    ['a', 1],
    ['b', 2],
  ])
})
