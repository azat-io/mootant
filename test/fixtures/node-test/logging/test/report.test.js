import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  introduce,
  announce,
  record,
  report,
  finish,
  notify,
  build,
  close,
  dump,
  hide,
  warn,
} from '../src/report.js'

test('reports the count', t => {
  let info = t.mock.method(console, 'info', () => {})
  report(2)
  assert.deepEqual(info.mock.calls[0].arguments, ['found 2 entries'])
})

test('warns without checking the message', () => {
  assert.equal(warn('cache'), 5)
})

test('fails to introduce nobody', () => {
  assert.throws(() => introduce(null), TypeError)
})

test('fails to notify without a context', () => {
  assert.throws(() => notify(null), TypeError)
})

test('finishes without a logger', () => {
  assert.equal(finish(), 'finished')
})

test('fails to dump a bigint as JSON', () => {
  assert.throws(() => dump({ id: 1n }), TypeError)
  assert.throws(() => hide({ id: 1n }), TypeError)
})

test('closes without checking the output', () => {
  assert.equal(close(), undefined)
})

test('builds the entries a local log function keeps', () => {
  assert.deepEqual(build(), ['built'])
})

test('fails to announce without a logger', () => {
  assert.throws(() => announce(null), TypeError)
})

test('records into a console it is given', () => {
  let lines = []
  record({ info: line => lines.push(line) })
  assert.deepEqual(lines, ['kept'])
})
