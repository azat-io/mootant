import { before, it } from 'node:test'
import assert from 'node:assert/strict'

import { pickDelay } from '../src/delay.js'

let ready = false

before(async () => {
  await new Promise(resolve => setTimeout(resolve, pickDelay(true)))
  ready = true
}, { timeout: 200 })

it('is ready', () => {
  assert.equal(ready, true)
})
