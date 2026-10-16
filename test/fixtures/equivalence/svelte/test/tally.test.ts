import { expect, it } from 'vitest'

import { Tally } from '../src/tally.svelte'

it('adds to the count', () => {
  let tally = new Tally(1)
  tally.add(2)

  expect(tally.count).toBe(3)
})
