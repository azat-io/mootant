import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { isFunction } from '../../../core/syntax/is-function'

describe('isFunction', () => {
  it.each<[string, Node['type'], boolean]>([
    ['function f() {}', 'FunctionDeclaration', true],
    ['x = function () {}', 'FunctionExpression', true],
    ['x = () => 1', 'ArrowFunctionExpression', true],
    ['class A {}', 'ClassDeclaration', false],
    ['x = 1', 'Literal', false],
  ])('answers %s', (source, type, expected) => {
    let { find } = createTestFile(source)

    expect(isFunction(find(type))).toBe(expected)
  })
})
