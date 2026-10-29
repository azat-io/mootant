import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isNumberLiteral } from '../../../../core/mutators/shared/is-number-literal'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isNumberLiteral', () => {
  it.each<[string, Node['type'], boolean]>([
    ['1', 'Literal', true],
    ['1n', 'Literal', true],
    ['-1', 'UnaryExpression', true],
    ['(1)', 'ParenthesizedExpression', true],
    ["'1'", 'Literal', false],
    ['-y', 'UnaryExpression', false],
    ['y', 'Identifier', false],
  ])('tells whether %s is a number literal', (text, type, expected) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isNumberLiteral(find(type, text))).toBe(expected)
  })
})
