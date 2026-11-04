import assert from 'node:assert/strict'
import { test } from 'node:test'

test('computed import with a template literal', async () => {
  let names = ['plugins']
  let [plugin] = await Promise.all(names.map(name => import(`../src/${name}.js`)))
  assert.equal(plugin.double(21), 42)
})
