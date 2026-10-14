import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getLiteralMutator } from '../../../../core/mutators/shared/get-literal-mutator'
import { createTestFile } from '../../../helpers/create-test-file'

describe('getLiteralMutator', () => {
  it.each<[string, Node['type'], string | null]>([
    ['true', 'Literal', 'boolean-literal'],
    ['1', 'Literal', 'number-literal'],
    ['-1', 'UnaryExpression', 'number-literal'],
    ['1n', 'Literal', 'number-literal'],
    ["'a'", 'Literal', 'string-literal'],
    ['`a`', 'TemplateLiteral', 'string-literal'],
    [`\`a\${b}\``, 'TemplateLiteral', 'string-literal'],
    ['(true)', 'ParenthesizedExpression', null],
    ['null', 'Literal', null],
    ['y', 'Identifier', null],
  ])('finds the mutator of %s', (text, type, expected) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(getLiteralMutator(find(type, text))).toBe(expected)
  })
})
