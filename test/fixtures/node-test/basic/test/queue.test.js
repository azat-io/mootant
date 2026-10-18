import { setTimeout } from 'node:timers/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { exclusive } from '../src/queue.js'

test('runs one task at a time', async () => {
  let order = []
  async function task(name) {
    order.push(`${name} start`)
    await setTimeout(10)
    order.push(`${name} end`)
  }
  await Promise.all([exclusive(() => task('a')), exclusive(() => task('b'))])
  assert.deepEqual(order, ['a start', 'a end', 'b start', 'b end'])
})
