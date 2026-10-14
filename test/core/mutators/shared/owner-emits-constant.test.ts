import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { ownerEmitsConstant } from '../../../../core/mutators/shared/owner-emits-constant'
import { createTestContext } from '../../../helpers/create-test-context'

describe('ownerEmitsConstant', () => {
  it.each<{
    setup: TestContextSetup
    type: Node['type']
    expected: boolean
    source: string
    value: boolean
    text: string
  }>([
    {
      source: 'if (x) notify(x)',
      type: 'Identifier',
      expected: true,
      value: false,
      text: 'x',
      setup: {},
    },
    {
      setup: { disabled: ['condition'] },
      source: 'if (x) notify(x)',
      type: 'Identifier',
      expected: true,
      value: false,
      text: 'x',
    },
    {
      source: [
        '// mootant-ignore-next-line condition',
        'if (x) notify(x)',
      ].join('\n'),
      type: 'Identifier',
      expected: true,
      value: false,
      text: 'x',
      setup: {},
    },
    {
      source: 'let items: string[] = []; if (items) f()',
      type: 'Identifier',
      expected: false,
      text: 'items',
      value: true,
      setup: {},
    },
    {
      source: 'if (x > 1) save(x)',
      type: 'BinaryExpression',
      expected: false,
      text: 'x > 1',
      value: false,
      setup: {},
    },
    {
      source: 'if (x > y) save(x)',
      type: 'BinaryExpression',
      expected: true,
      text: 'x > y',
      value: false,
      setup: {},
    },
    {
      source: 'function f(x: { valid: boolean }): boolean { return !x.valid }',
      type: 'UnaryExpression',
      text: '!x.valid',
      expected: true,
      value: true,
      setup: {},
    },
    {
      type: 'UnaryExpression',
      source: 'x = !(y > z)',
      text: '!(y > z)',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'x = (y > z) as boolean',
      text: '(y > z) as boolean',
      type: 'TSAsExpression',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'x = (y > z) as boolean',
      text: '(y > z) as boolean',
      type: 'TSAsExpression',
      expected: false,
      value: true,
      setup: {},
    },
    {
      type: 'UnaryExpression',
      source: 'x = !(y > 1)',
      text: '!(y > 1)',
      expected: false,
      value: true,
      setup: {},
    },
    {
      source: 'function f(c, x) { return c ? true : x }',
      type: 'ConditionalExpression',
      text: 'c ? true : x',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'function f(c, x) { return c ? x : false }',
      type: 'ConditionalExpression',
      text: 'c ? x : false',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'function f(c, x) { return c ? x : y }',
      type: 'ConditionalExpression',
      text: 'c ? x : y',
      expected: false,
      value: false,
      setup: {},
    },
    {
      source: 'if (a && b) f()',
      type: 'LogicalExpression',
      text: 'a && b',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'if (a && b) f()',
      type: 'LogicalExpression',
      expected: false,
      text: 'a && b',
      value: true,
      setup: {},
    },
    {
      source: 'if (a || b) f()',
      type: 'LogicalExpression',
      text: 'a || b',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'if (0) f()',
      type: 'Literal',
      expected: true,
      value: true,
      text: '0',
      setup: {},
    },
    {
      source: 'if (1) f()',
      type: 'Literal',
      expected: false,
      value: false,
      text: '1',
      setup: {},
    },
    {
      source: 'if (a ?? b) f()',
      type: 'LogicalExpression',
      text: 'a ?? b',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'if (a ?? b) f()',
      type: 'LogicalExpression',
      expected: false,
      text: 'a ?? b',
      value: false,
      setup: {},
    },
  ])(
    'answers $source for $type and $text',
    ({ expected, source, value, setup, type, text }) => {
      let { context, find } = createTestContext(source, setup)

      expect(ownerEmitsConstant(find(type, text), value, context)).toBe(
        expected,
      )
    },
  )
})
