import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { getConditionConstants } from '../../../../core/mutators/shared/get-condition-constants'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Parameters with the types of the catalog's examples.
 */
const PARAMETERS = [
  'flag: boolean',
  'items: string[]',
  'el: Element | null',
  'enabled: boolean | undefined',
  'nothing: undefined',
].join(', ')

describe('getConditionConstants', () => {
  it.each<{
    setup: TestContextSetup
    expected: boolean[]
    type: Node['type']
    body: string
    text: string
  }>([
    {
      body: "x = flag ? 'yes' : 'no'",
      expected: [true, false],
      type: 'Identifier',
      text: 'flag',
      setup: {},
    },
    {
      body: 'x = ((flag)) ? 1 : 2',
      expected: [true, false],
      type: 'Identifier',
      text: 'flag',
      setup: {},
    },
    {
      body: 'if (items) run()',
      type: 'Identifier',
      expected: [false],
      text: 'items',
      setup: {},
    },
    {
      body: 'if (!items) run()',
      type: 'UnaryExpression',
      expected: [true],
      text: '!items',
      setup: {},
    },
    {
      body: 'if (nothing) run()',
      type: 'Identifier',
      expected: [true],
      text: 'nothing',
      setup: {},
    },
    {
      body: 'if (el) show(el)',
      expected: [true, false],
      type: 'Identifier',
      text: 'el',
      setup: {},
    },
    {
      body: 'while (items.length) handle(items.shift())',
      type: 'MemberExpression',
      text: 'items.length',
      expected: [false],
      setup: {},
    },
    {
      body: 'while (items.length) handle(items.shift())',
      setup: { timeouts: true },
      type: 'MemberExpression',
      expected: [true, false],
      text: 'items.length',
    },
    {
      body: 'let negated = !flag',
      type: 'UnaryExpression',
      expected: [true, false],
      text: '!flag',
      setup: {},
    },
    {
      type: 'UnaryExpression',
      expected: [true, false],
      body: 'let m = !!el',
      text: '!!el',
      setup: {},
    },
    {
      body: 'if (flag as boolean) run()',
      text: 'flag as boolean',
      expected: [true, false],
      type: 'TSAsExpression',
      setup: {},
    },
    {
      body: 'for (;;) { step(); if (done()) break }',
      type: 'CallExpression',
      expected: [true],
      text: 'done()',
      setup: {},
    },
    {
      body: 'for (;;) { if (ready()) break; tick() }',
      type: 'CallExpression',
      text: 'ready()',
      expected: [],
      setup: {},
    },
    {
      body: 'if (enabled ?? false) run()',
      type: 'LogicalExpression',
      text: 'enabled ?? false',
      expected: [false],
      setup: {},
    },
    {
      body: 'if (enabled ?? true) run()',
      type: 'LogicalExpression',
      text: 'enabled ?? true',
      expected: [true],
      setup: {},
    },
    {
      body: 'if (!(enabled ?? true)) run()',
      text: '!(enabled ?? true)',
      type: 'UnaryExpression',
      expected: [false],
      setup: {},
    },
    {
      setup: { disabled: ['boolean-literal'] },
      body: 'if (enabled ?? false) run()',
      type: 'LogicalExpression',
      text: 'enabled ?? false',
      expected: [true, false],
    },
    {
      body: [
        '// mootant-ignore-next-line boolean-literal',
        'if (enabled ?? false) run()',
      ].join('\n'),
      type: 'LogicalExpression',
      text: 'enabled ?? false',
      expected: [true, false],
      setup: {},
    },
    {
      body: 'x = items.map(x => !x.done)',
      type: 'UnaryExpression',
      expected: [true, false],
      text: '!x.done',
      setup: {},
    },
    {
      body: 'x = items.filter(row => !row.done)',
      type: 'UnaryExpression',
      expected: [true, false],
      text: '!row.done',
      setup: {},
    },
    {
      body: 'x = items.filter(r => { if (r.x) return true; return false })',
      type: 'MemberExpression',
      expected: [true, false],
      text: 'r.x',
      setup: {},
    },
    {
      body: 'x = items.sort(r => { if (r.x) return 0; return 1 })',
      type: 'MemberExpression',
      expected: [false],
      text: 'r.x',
      setup: {},
    },
  ])('plans $body', ({ expected, setup, body, type, text }) => {
    let { context, find } = createTestContext(
      `function f(${PARAMETERS}) { ${body} }`,
      setup,
    )

    expect(
      getConditionConstants(find(type, text), createRunContext(context)),
    ).toEqual(expected)
  })

  it.each<[string, Node['type'], string]>([
    ['if (a < b) x()', 'BinaryExpression', 'a < b'],
    ['if (a && b) y()', 'LogicalExpression', 'a && b'],
    ['if (true) z()', 'Literal', 'true'],
    ['if (-1) w()', 'UnaryExpression', '-1'],
    ['if (`a`) w()', 'TemplateLiteral', '`a`'],
    ['if (null) w()', 'Literal', 'null'],
    ['k = !(a || b)', 'UnaryExpression', '!(a || b)'],
    ['m = !!value', 'UnaryExpression', '!value'],
    ['if (!x) run()', 'Identifier', 'x'],
    ['if (flag as boolean) run()', 'Identifier', 'flag'],
    ['if (!x && y) run()', 'UnaryExpression', '!x'],
    ['x = y', 'Identifier', 'y'],
    ['if ((x)) run()', 'ParenthesizedExpression', '(x)'],
  ])('plans nothing for %s', (source, type, text) => {
    let { context, find } = createTestContext(source)

    expect(
      getConditionConstants(find(type, text), createRunContext(context)),
    ).toEqual([])
  })
})
