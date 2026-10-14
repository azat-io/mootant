import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { getLiteralValue } from '../../../../core/mutators/shared/get-literal-value'
import { createTestFile } from '../../../helpers/create-test-file'

describe('getLiteralValue', () => {
  it.each<{
    type: Node['type']
    expected: unknown
    source: string
    text: string
  }>([
    { source: "x = 'a'", type: 'Literal', expected: 'a', text: "'a'" },
    {
      source: String.raw`x = "\u{61}"`,
      text: String.raw`"\u{61}"`,
      type: 'Literal',
      expected: 'a',
    },
    { source: 'x = 2', type: 'Literal', expected: 2, text: '2' },
    { source: 'x = 10n', type: 'Literal', expected: 10n, text: '10n' },
    { source: 'x = true', type: 'Literal', expected: true, text: 'true' },
    { type: 'UnaryExpression', source: 'x = -1', expected: -1, text: '-1' },
    { type: 'UnaryExpression', source: 'x = -2n', expected: -2n, text: '-2n' },
    {
      source: 'x = `a\\u{62}`',
      type: 'TemplateLiteral',
      text: '`a\\u{62}`',
      expected: 'ab',
    },
    {
      type: 'ParenthesizedExpression',
      source: 'x = (((1)))',
      text: '(((1)))',
      expected: 1,
    },
    { source: 'x = null', type: 'Literal', expected: null, text: 'null' },
    { source: 'x = /a/u', type: 'Literal', expected: null, text: '/a/u' },
    {
      source: `x = \`a\${b}\``,
      type: 'TemplateLiteral',
      text: `\`a\${b}\``,
      expected: null,
    },
    {
      type: 'UnaryExpression',
      source: 'x = -(1)',
      expected: null,
      text: '-(1)',
    },
    {
      type: 'UnaryExpression',
      source: 'x = - -1',
      expected: null,
      text: '- -1',
    },
    {
      type: 'UnaryExpression',
      source: "x = -'a'",
      expected: null,
      text: "-'a'",
    },
    { type: 'UnaryExpression', source: 'x = !1', expected: null, text: '!1' },
    { type: 'Identifier', source: 'x = y', expected: null, text: 'y' },
    {
      source: 'x = tag`\\unicode`',
      type: 'TemplateLiteral',
      text: '`\\unicode`',
      expected: null,
    },
  ])('reads $source', ({ expected, source, type, text }) => {
    let { find } = createTestFile(source)

    expect(getLiteralValue(find(type, text))).toBe(expected)
  })
})
