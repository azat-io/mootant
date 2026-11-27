import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { word } from '../src/word.js'

let require = createRequire(import.meta.url)

test('reads the words of both modules', () => {
  assert.deepEqual([word, require('../src/legacy.cjs')], ['ORIG', 'ORIG'])
})
