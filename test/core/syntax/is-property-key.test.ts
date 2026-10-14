import { describe, expect, it } from 'vitest'

import { isPropertyKey } from '../../../core/syntax/is-property-key'
import { createTestFile } from '../../helpers/create-test-file'

describe('isPropertyKey', () => {
  it.each([
    { source: 'x = { a: 1 }', expected: true },
    { source: 'x = { [a]: 1 }', expected: true },
    { source: 'x = { [(a)]: 1 }', expected: true },
    { source: 'x = { [a as string]: 1 }', expected: true },
    { source: 'x = { [a!]: 1 }', expected: true },
    { source: 'class C { [(a satisfies string)] = 1 }', expected: true },
    { source: 'x = { b: a as string }', expected: false },
    { source: 'x = { a() {} }', expected: true },
    { source: 'class C { a = 1 }', expected: true },
    { source: 'class C { a() {} }', expected: true },
    { source: 'class C { accessor a = 1 }', expected: true },
    { source: 'x = { b: a }', expected: false },
    { source: 'x = b.a', expected: false },
    { expected: false, source: 'f(a)' },
  ])('tells whether a is a key in $source', ({ expected, source }) => {
    let { find, tree } = createTestFile(source)

    expect(isPropertyKey(tree, find('Identifier', 'a'))).toBe(expected)
  })

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isPropertyKey(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('x = { a: 1 }')
    let other = createTestFile('x = { a: 1 }')

    expect(() => isPropertyKey(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
