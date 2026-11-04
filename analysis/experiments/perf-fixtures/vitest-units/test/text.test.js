import { beforeAll, describe, expect, test } from 'vitest'

import { capitalize, countWords, joinList, pad, slugify, truncate } from '../src/text.js'

// Loading and setting up a real test file takes time; units of this file are
// long enough that running them one at a time shows.
beforeAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 150))
})

describe('slugify', () => {
  test('lowercases and joins words', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })
  test('trims dashes', () => {
    expect(slugify('  --Hi--  ')).toBe('hi')
  })
})

describe('truncate', () => {
  test('keeps short text', () => {
    expect(truncate('abc', 5)).toBe('abc')
  })
  test('cuts long text', () => {
    expect(truncate('abcdef', 4).length).toBe(4)
  })
})

describe('pad', () => {
  test('pads numbers', () => {
    expect(pad(7, 3)).toHaveLength(3)
  })
})

describe('countWords', () => {
  test('counts words', () => {
    expect(countWords('a b  c')).toBe(3)
  })
})

describe('capitalize', () => {
  test('capitalizes', () => {
    expect(capitalize('word')).toBe('Word')
  })
})

describe('joinList', () => {
  test('joins two', () => {
    expect(joinList(['a', 'b'])).toContain('a')
  })
  test('joins three', () => {
    expect(joinList(['a', 'b', 'c'])).toBe('a, b and c')
  })
})
