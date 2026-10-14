import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TypeView } from '../../../../core/mutators/shared/get-type-view'

import { isCanonicalFalsy } from '../../../../core/mutators/shared/is-canonical-falsy'
import { createTestFile } from '../../../helpers/create-test-file'

describe('isCanonicalFalsy', () => {
  it.each<{
    type: TypeView['type']
    nodeType: Node['type']
    expected: boolean
    text: string
  }>([
    { nodeType: 'Literal', type: 'string', expected: true, text: "''" },
    { nodeType: 'TemplateLiteral', type: 'string', expected: true, text: '``' },
    {
      nodeType: 'ParenthesizedExpression',
      text: "('' as string)",
      type: 'string',
      expected: true,
    },
    { nodeType: 'Literal', type: 'number', expected: true, text: '0' },
    { nodeType: 'UnaryExpression', type: 'number', expected: true, text: '-0' },
    { nodeType: 'Literal', type: 'bigint', expected: true, text: '0n' },
    { nodeType: 'Literal', type: 'boolean', expected: true, text: 'false' },
    { nodeType: 'Literal', expected: false, type: 'string', text: "'a'" },
    { nodeType: 'Literal', expected: false, type: 'number', text: '0n' },
    { nodeType: 'Identifier', expected: false, type: 'number', text: 'zero' },
    { nodeType: 'Literal', expected: false, type: 'object', text: 'false' },
  ])('answers $type with $text', ({ nodeType, expected, type, text }) => {
    let { find } = createTestFile(`x = ${text}`)

    expect(isCanonicalFalsy(type, find(nodeType, text))).toBe(expected)
  })
})
