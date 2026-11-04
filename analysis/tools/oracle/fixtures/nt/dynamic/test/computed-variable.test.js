import assert from 'node:assert/strict'
import { test } from 'node:test'

test('computed import through a variable', async () => {
  let specifier = '../src/' + ['ma', 'th'].join('') + '.js'
  let module = await import(specifier)
  assert.equal(module.add(2, 3), 5)
})
