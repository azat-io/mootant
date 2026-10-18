import { describe, test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import assert from 'node:assert/strict'

import { getPeak, track } from '../src/track.js'

describe('tracked tasks', { concurrency: true }, () => {
  test('first', async () => {
    await track(() => setTimeout(20))
  })

  test('second', async () => {
    await track(() => setTimeout(20))
  })
})

test('ran both at once', () => {
  assert.equal(getPeak(), 2)
})
