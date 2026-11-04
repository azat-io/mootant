import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  chatter,
  depth,
  grow,
  makeRows,
  maybeExit,
  maybeFail,
  notify,
  pollUntil,
  rejectLater,
  sumTo,
} from '../src/hazards.js'

test('exit only above 100', () => {
  assert.equal(maybeExit(100), 100)
})

test('exit code only above 100', () => {
  assert.equal(maybeFail(100), 100)
})

test('sum', () => {
  assert.equal(sumTo(5), 10)
})

test('poll', async () => {
  let calls = 0
  assert.equal(await pollUntil(async () => ++calls > 2, 5), true)
})

test('depth', () => {
  assert.equal(depth(50), 50)
})

test('notify without a listener', async () => {
  notify(undefined)
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(true, true)
})

test('reject handled', async () => {
  assert.equal(rejectLater(1), 1)
  await new Promise(resolve => setTimeout(resolve, 5))
})

test('rows', () => {
  assert.equal(makeRows(4, 3), 4)
})

test('quiet chatter', () => {
  assert.equal(chatter(20000, false), 20000)
})

test('grow', () => {
  assert.equal(grow(1), 1)
})
