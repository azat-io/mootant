import { expect, test } from 'vitest'

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
  expect(maybeExit(100)).toBe(100)
})

test('exit code only above 100', () => {
  expect(maybeFail(100)).toBe(100)
})

test('sum', () => {
  expect(sumTo(5)).toBe(10)
})

test('poll', async () => {
  let calls = 0
  expect(await pollUntil(async () => ++calls > 2, 5)).toBe(true)
})

test('depth', () => {
  expect(depth(50)).toBe(50)
})

test('notify without a listener', async () => {
  notify(undefined)
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(true).toBe(true)
})

test('reject handled', async () => {
  expect(rejectLater(1)).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 5))
})

test('rows', () => {
  expect(makeRows(4, 3)).toBe(4)
})

test('quiet chatter', () => {
  expect(chatter(20000, false)).toBe(20000)
})

test('grow', () => {
  expect(grow(1)).toBe(1)
})
