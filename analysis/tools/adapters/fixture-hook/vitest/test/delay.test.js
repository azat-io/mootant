import { beforeAll, expect, it } from 'vitest'

import { pickDelay } from '../src/delay.js'

let ready = false

beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, pickDelay(true)))
  ready = true
}, 200)

it('is ready', () => {
  expect(ready).toBe(true)
})
