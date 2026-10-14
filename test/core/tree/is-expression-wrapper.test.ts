import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isExpressionWrapper } from '../../../core/tree/is-expression-wrapper'
import { createTestFile } from '../../helpers/create-test-file'

describe('isExpressionWrapper', () => {
  it.each<[string, Node['type'], boolean]>([
    ['x = (a)', 'ParenthesizedExpression', true],
    ['x = a as T', 'TSAsExpression', true],
    ['x = a satisfies T', 'TSSatisfiesExpression', true],
    ['x = a!', 'TSNonNullExpression', true],
    ['x = <T>a', 'TSTypeAssertion', true],
    ['x = f<T>', 'TSInstantiationExpression', true],
    ['x = a?.b', 'ChainExpression', false],
    ['x = !a', 'UnaryExpression', false],
    ['x = a', 'Identifier', false],
  ])('answers %s', (source, type, expected) => {
    let { find } = createTestFile(source)

    expect(isExpressionWrapper(find(type))).toBe(expected)
  })
})
