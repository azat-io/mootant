import { expect, it } from 'vitest'

import { scale, UNIT } from '../src/scale'

it('doubles', () => {
  expect(scale(2)).toBe(4)
})

it('loops only for a mutant the test before kills', () => {
  let turns = 0
  while (scale(2) !== 4) {
    turns += 1
  }
  expect(turns).toBe(0)
})

it('takes its time', async () => {
  await new Promise(resolve => {
    setTimeout(resolve, 300)
  })
  expect(UNIT).toBe('px')
})
