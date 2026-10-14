import { describe, expect, it } from 'vitest'

import { unwrapParentheses } from '../../../core/tree/unwrap-parentheses'
import { createTestFile } from '../../helpers/create-test-file'

describe('unwrapParentheses', () => {
  it.each([
    ['a', 'a'],
    ['(a)', 'a'],
    ['(((a + b)))', 'a + b'],
    ['((a as T))', 'a as T'],
    ['((a)!)', '(a)!'],
  ])('unwraps %s to %s', (source, expected) => {
    let { parsed, find } = createTestFile(source)
    let { expression } = find('ExpressionStatement')

    let node = unwrapParentheses(expression)

    expect(parsed.text.slice(node.start, node.end)).toBe(expected)
  })

  it('returns the node itself when it has no parentheses', () => {
    let { expression } = createTestFile('a + b').find('ExpressionStatement')

    expect(unwrapParentheses(expression)).toBe(expression)
  })
})
