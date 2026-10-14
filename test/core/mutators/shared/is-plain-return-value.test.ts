import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isPlainReturnValue } from '../../../../core/mutators/shared/is-plain-return-value'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isPlainReturnValue', () => {
  it.each<{
    type: Node['type']
    expected: boolean
    source: string
    text: string
  }>([
    { source: "x = 'a'", type: 'Literal', expected: true, text: "'a'" },
    { type: 'UnaryExpression', source: 'x = -1', expected: true, text: '-1' },
    {
      type: 'UnaryExpression',
      source: 'x = void g()',
      text: 'void g()',
      expected: true,
    },
    { type: 'UnaryExpression', source: 'x = !a', expected: false, text: '!a' },
    {
      source: 'x = undefined',
      type: 'Identifier',
      text: 'undefined',
      expected: true,
    },
    { type: 'Identifier', source: 'x = y', expected: false, text: 'y' },
    {
      type: 'ThisExpression',
      source: 'x = this',
      expected: true,
      text: 'this',
    },
    {
      type: 'ArrowFunctionExpression',
      source: 'x = () => 1',
      text: '() => 1',
      expected: true,
    },
    {
      source: 'x = function () {}',
      type: 'FunctionExpression',
      text: 'function () {}',
      expected: true,
    },
    {
      type: 'ClassExpression',
      source: 'x = class {}',
      text: 'class {}',
      expected: true,
    },
    { type: 'CallExpression', source: 'x = g()', expected: false, text: 'g()' },
  ])('answers $source', ({ expected, source, type, text }) => {
    let { context, find } = createTestContext(source)

    expect(isPlainReturnValue(find(type, text), context)).toBe(expected)
  })
})
