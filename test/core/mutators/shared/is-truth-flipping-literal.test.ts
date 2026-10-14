import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isTruthFlippingLiteral } from '../../../../core/mutators/shared/is-truth-flipping-literal'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isTruthFlippingLiteral', () => {
  it.each<[string, Node['type'], boolean]>([
    ['true', 'Literal', true],
    ["'yes'", 'Literal', true],
    ["''", 'Literal', true],
    ['``', 'TemplateLiteral', true],
    ['0', 'Literal', true],
    ['-1', 'UnaryExpression', true],
    ['0n', 'Literal', true],
    ['-1n', 'UnaryExpression', true],
    ['1', 'Literal', false],
    ['-2', 'UnaryExpression', false],
    ['null', 'Literal', false],
    ['y', 'Identifier', false],
  ])('answers %s', (text, type, expected) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isTruthFlippingLiteral(find(type, text))).toBe(expected)
  })
})
