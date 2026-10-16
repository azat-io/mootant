import { describe, expect, it } from 'vitest'

import { isResultUnused } from '../../../core/syntax/is-result-unused'
import { createTestFile } from '../../helpers/create-test-file'

describe('isResultUnused', () => {
  it.each([
    { expected: true, source: 'a' },
    { source: '(a as T)', expected: true },
    { source: 'x = (a, b)', expected: true },
    { source: 'b, a', expected: true },
    { source: 'x = (b, (c, a))', expected: false },
    { source: 'x = (b, a)', expected: false },
    { source: 'void a', expected: true },
    { source: 'x = !a', expected: false },
    { source: 'for (a; ;) {}', expected: true },
    { source: 'for (;; b, a) {}', expected: true },
    { source: 'for (; a;) {}', expected: false },
    { source: 'x = a', expected: false },
  ])('tells whether a is unused in $source', ({ expected, source }) => {
    let { find, tree } = createTestFile(source)

    expect(isResultUnused(tree, find('Identifier', 'a'))).toBe(expected)
  })

  it('tells that the body of a discarded arrow function is unused', () => {
    let { find, tree } = createTestFile('f(() => (a), () => b)')
    let discarded = new Set([find('ArrowFunctionExpression', '() => (a)')])

    expect(isResultUnused(tree, find('Identifier', 'a'), discarded)).toBe(true)
    expect(isResultUnused(tree, find('Identifier', 'b'), discarded)).toBe(false)
    expect(isResultUnused(tree, find('Identifier', 'a'))).toBe(false)
  })

  it('returns false for the program', () => {
    let { find, tree } = createTestFile('a')

    expect(isResultUnused(tree, find('Program'))).toBe(false)
  })

  it('throws for a node outside the runtime tree', () => {
    let { tree } = createTestFile('a')
    let other = createTestFile('a')

    expect(() => isResultUnused(tree, other.find('Identifier', 'a'))).toThrow(
      'Node is not part of the runtime tree of the file.',
    )
  })
})
