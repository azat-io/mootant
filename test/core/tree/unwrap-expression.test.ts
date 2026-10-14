import { describe, expect, it } from 'vitest'

import { unwrapExpression } from '../../../core/tree/unwrap-expression'
import { createTestFile } from '../../helpers/create-test-file'

describe('unwrapExpression', () => {
  it.each([
    ['a', 'a'],
    ['((a))', 'a'],
    ['a as T', 'a'],
    ['a satisfies T', 'a'],
    ['a!', 'a'],
    ['<T>a', 'a'],
    ['f<T>', 'f'],
    ['((a as unknown) as T)!', 'a'],
    ['(<T>(a + b)!)', 'a + b'],
    ['(a + b) as T', 'a + b'],
    ['f(a as T)', 'f(a as T)'],
  ])('unwraps %s to %s', (source, expected) => {
    let { parsed, find } = createTestFile(source)
    let { expression } = find('ExpressionStatement')

    let node = unwrapExpression(expression)

    expect(parsed.text.slice(node.start, node.end)).toBe(expected)
  })

  it('returns the node itself when it has no wrappers', () => {
    let { expression } = createTestFile('a.b').find('ExpressionStatement')

    expect(unwrapExpression(expression)).toBe(expression)
  })
})
