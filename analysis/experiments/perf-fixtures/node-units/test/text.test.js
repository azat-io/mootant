import { before, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { capitalize, countWords, joinList, pad, slugify, truncate } from '../src/text.js'

before(async () => {
  await new Promise(resolve => setTimeout(resolve, 150))
})

describe('slugify', () => {
  test('lowercases and joins words', () => {
    assert.equal(slugify('Hello World'), 'hello-world')
  })
  test('trims dashes', () => {
    assert.equal(slugify('  --Hi--  '), 'hi')
  })
})

describe('truncate', () => {
  test('keeps short text', () => {
    assert.equal(truncate('abc', 5), 'abc')
  })
  test('cuts long text', () => {
    assert.equal(truncate('abcdef', 4).length, 4)
  })
})

describe('pad', () => {
  test('pads numbers', () => {
    assert.equal(pad(7, 3).length, 3)
  })
})

describe('countWords', () => {
  test('counts words', () => {
    assert.equal(countWords('a b  c'), 3)
  })
})

describe('capitalize', () => {
  test('capitalizes', () => {
    assert.equal(capitalize('word'), 'Word')
  })
})

describe('joinList', () => {
  test('joins two', () => {
    assert.ok(joinList(['a', 'b']).includes('a'))
  })
  test('joins three', () => {
    assert.equal(joinList(['a', 'b', 'c']), 'a, b and c')
  })
})
