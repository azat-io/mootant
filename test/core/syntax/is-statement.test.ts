import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { createTestFile } from '../../helpers/create-test-file'
import { isStatement } from '../../../core/syntax/is-statement'

describe('isStatement', () => {
  it.each<[string, Node['type'], boolean]>([
    ['f()', 'ExpressionStatement', true],
    ['if (a) {}', 'IfStatement', true],
    ['let x = 1', 'VariableDeclaration', true],
    ['function f() {}', 'FunctionDeclaration', true],
    ['class C {}', 'ClassDeclaration', true],
    ['let x = 1', 'VariableDeclarator', false],
    ['x = function () {}', 'FunctionExpression', false],
    ['f()', 'CallExpression', false],
  ])('answers %s for %s', (source, type, expected) => {
    let { find } = createTestFile(source)

    expect(isStatement(find(type))).toBe(expected)
  })
})
