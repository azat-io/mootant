import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { isMovedToward } from '../../../../core/mutators/shared/is-moved-toward'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isMovedToward', () => {
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
      expected: false,
      value: false,
      text: 'x',
    },
    {
      source: 'if (x > 1) save(x)',
      type: 'BinaryExpression',
      expected: true,
      text: 'x > 1',
      value: false,
      setup: {},
    },
    {
      source: 'if (x > 1) save(x)',
      type: 'BinaryExpression',
      expected: true,
      text: 'x > 1',
      value: true,
      setup: {},
    },
    {
      setup: { disabled: ['comparison-operator'] },
      source: 'if (x > 1) save(x)',
      type: 'BinaryExpression',
      expected: false,
      text: 'x > 1',
      value: false,
    },
    {
      source: 'if (!(x > 1)) save(x)',
      type: 'UnaryExpression',
      text: '!(x > 1)',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: "if (x === 'a') save(x)",
      type: 'BinaryExpression',
      text: "x === 'a'",
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'if (a && b) f()',
      type: 'LogicalExpression',
      text: 'a && b',
      expected: true,
      value: true,
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
      setup: { disabled: ['logical-operator', 'condition'] },
      source: 'if (a && b) f()',
      type: 'LogicalExpression',
      expected: false,
      text: 'a && b',
      value: true,
    },
    {
      setup: { disabled: ['condition'] },
      source: 'if (a || b) f()',
      type: 'LogicalExpression',
      text: 'a || b',
      expected: true,
      value: true,
    },
    {
      setup: { disabled: ['condition', 'logical-operator'] },
      source: 'if (a || b) f()',
      type: 'LogicalExpression',
      expected: false,
      text: 'a || b',
      value: true,
    },
    {
      setup: { disabled: ['condition', 'logical-operator'] },
      source: 'if (a || b > 1) f()',
      type: 'LogicalExpression',
      text: 'a || b > 1',
      expected: true,
      value: true,
    },
    {
      setup: { disabled: ['condition'] },
      type: 'LogicalExpression',
      source: 'x = a || b',
      expected: false,
      text: 'a || b',
      value: false,
    },
    {
      source: 'function f(u) { return u.isOwner && u.isActive }',
      text: 'u.isOwner && u.isActive',
      setup: { file: 'example.js' },
      type: 'LogicalExpression',
      expected: true,
      value: false,
    },
    {
      source: 'function f(e: boolean | undefined) { if (e ?? true) f() }',
      type: 'LogicalExpression',
      text: 'e ?? true',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'function f(e: boolean | undefined) { if (e ?? true) f() }',
      setup: { disabled: ['boolean-literal'] },
      type: 'LogicalExpression',
      text: 'e ?? true',
      expected: true,
      value: false,
    },
    {
      source: 'function f(e: boolean | undefined) { if (e ?? true) f() }',
      setup: { disabled: ['boolean-literal', 'condition'] },
      type: 'LogicalExpression',
      text: 'e ?? true',
      expected: false,
      value: false,
    },
    {
      source: 'if (c ? true : x) f()',
      type: 'ConditionalExpression',
      text: 'c ? true : x',
      expected: true,
      value: false,
      setup: {},
    },
    {
      setup: { disabled: ['condition', 'boolean-literal'] },
      source: 'if (c ? true : x) f()',
      type: 'ConditionalExpression',
      text: 'c ? true : x',
      expected: false,
      value: true,
    },
    {
      setup: { disabled: ['condition', 'boolean-literal'] },
      source: 'if (c ? false : x) f()',
      type: 'ConditionalExpression',
      text: 'c ? false : x',
      expected: false,
      value: false,
    },
    {
      setup: { disabled: ['condition'] },
      source: 'if (a > 0 && b > 0) f()',
      type: 'LogicalExpression',
      text: 'a > 0 && b > 0',
      expected: true,
      value: true,
    },
    {
      source: 'if (c ? x : false) f()',
      type: 'ConditionalExpression',
      text: 'c ? x : false',
      expected: true,
      value: true,
      setup: {},
    },
    {
      source: 'if (c ? x : false) f()',
      type: 'ConditionalExpression',
      text: 'c ? x : false',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'if ((c ? true : x) && y) f()',
      type: 'ConditionalExpression',
      text: 'c ? true : x',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'if ((c ? x : false) && y) f()',
      type: 'ConditionalExpression',
      text: 'c ? x : false',
      expected: true,
      value: true,
      setup: {},
    },
    {
      setup: { disabled: ['condition'] },
      type: 'ConditionalExpression',
      source: 'if (c ? x : y) f()',
      text: 'c ? x : y',
      expected: false,
      value: true,
    },
    {
      setup: { disabled: ['condition'] },
      source: 'if (c ? x > 1 : y) f()',
      type: 'ConditionalExpression',
      text: 'c ? x > 1 : y',
      expected: true,
      value: false,
    },
    {
      setup: { disabled: ['condition'] },
      source: 'if (c ? y : x > 1) f()',
      type: 'ConditionalExpression',
      text: 'c ? y : x > 1',
      expected: true,
      value: false,
    },
    {
      type: 'ConditionalExpression',
      source: 'if (c ? 0 : x) f()',
      text: 'c ? 0 : x',
      expected: true,
      value: true,
      setup: {},
    },
    {
      type: 'ConditionalExpression',
      source: 'if (c ? x : 1) f()',
      text: 'c ? x : 1',
      expected: true,
      value: false,
      setup: {},
    },
    {
      source: 'while (true) { if (step()) break }',
      type: 'Literal',
      expected: true,
      text: 'true',
      value: false,
      setup: {},
    },
    {
      source: 'while (true) { if (step()) break }',
      setup: { disabled: ['boolean-literal'] },
      type: 'Literal',
      expected: false,
      text: 'true',
      value: false,
    },
    {
      source: 'if (1) run()',
      type: 'Literal',
      expected: false,
      value: false,
      text: '1',
      setup: {},
    },
    {
      source: 'if ((x as boolean)) run()',
      type: 'TSAsExpression',
      text: 'x as boolean',
      expected: true,
      value: true,
      setup: {},
    },
  ])(
    'moves $source from $type toward $text',
    ({ expected, source, value, setup, type, text }) => {
      let { context, find } = createTestContext(source, setup)
      let decision = find(type, text)

      expect(
        isMovedToward(
          {
            candidate: { mutator: 'statement-removal', node: decision },
            decision,
            value,
          },
          createRunContext(context),
        ),
      ).toBe(expected)
    },
  )

  it.each<[string, boolean]>([
    [
      [
        '// mootant-ignore-next-line comparison-operator',
        'if (x > 1) save(x)',
      ].join('\n'),
      false,
    ],
    [['// mootant-ignore-next-line', 'if (x > 1) save(x)'].join('\n'), true],
  ])('follows ignore comments in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      isMovedToward(
        {
          candidate: {
            node: find('ExpressionStatement'),
            mutator: 'statement-removal',
          },
          decision: find('BinaryExpression'),
          value: false,
        },
        createRunContext(context),
      ),
    ).toBe(expected)
  })
})
