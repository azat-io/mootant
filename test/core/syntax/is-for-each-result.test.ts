import { describe, expect, it } from 'vitest'

import { isForEachResult } from '../../../core/syntax/is-for-each-result'
import { createTestFile } from '../../helpers/create-test-file'

describe('isForEachResult', () => {
  it.each([
    'items.forEach(() => a)',
    'items.forEach(item => (a as number))',
    'items?.forEach(() => a)',
    'items.forEach?.(() => a)',
    'items.forEach((() => a), context)',
    '(items.forEach as Function)(() => a)',
    'items.forEach(async () => a)',
    'items.forEach(() => (b, a))',
  ])('accepts a in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isForEachResult(tree, find('Identifier', 'a'))).toBe(true)
  })

  it.each([
    'items.map(() => a)',
    'items.forEach(callback, () => a)',
    'items[forEach](() => a)',
    'forEach(() => a)',
    'class C { #forEach() {} f() { this.#forEach(() => a) } }',
    'new Each(() => a)',
    'x = [() => a]',
    'items.forEach(() => (a, b))',
    'items.forEach(() => f(a))',
    'items.forEach(() => () => a)',
    'items.forEach(function () { return a })',
    'items.forEach(a => b)',
    'x = () => a',
    'x = a',
  ])('rejects a in %s', source => {
    let { find, tree } = createTestFile(source)

    expect(isForEachResult(tree, find('Identifier', 'a'))).toBe(false)
  })

  it('rejects the block body of a forEach callback', () => {
    let { find, tree } = createTestFile('items.forEach(() => {})')

    expect(isForEachResult(tree, find('BlockStatement'))).toBe(false)
  })

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isForEachResult(tree, find('Program'))).toBe(false)
  })
})
