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
    {
      setup: { disabled: ['comparison-operator'] },
      body: 'if (a < b) run()',
      type: 'BinaryExpression',
      expected: [true],
      text: 'a < b',
    },
    {
      body: [
        '// mootant-ignore-next-line comparison-operator',
        'if (a < b) run()',
      ].join('\n'),
      type: 'BinaryExpression',
      expected: [true],
      text: 'a < b',
      setup: {},
    },
    {
      body: ['// mootant-ignore-next-line condition', 'if (a < b) run()'].join(
        '\n',
      ),
      type: 'BinaryExpression',
      text: 'a < b',
      expected: [],
      setup: {},
    },
  ])('plans $body', ({ expected, setup, body, type, text }) => {
    let { context, find } = createTestContext(
      `function f(${PARAMETERS}) { ${body} }`,
      setup,
    )

    expect(
      getConditionConstants(find(type, text), createRunContext(context)).values,
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
      getConditionConstants(find(type, text), createRunContext(context)).values,
    ).toEqual([])
  })

  it.each<{
    expected: [string, string, string | null][]
    type: Node['type']
    source: string
    text: string
  }>([
    {
      expected: [
        ['true', 'comparison-region', 'comparison-operator'],
        ['false', 'O1', 'comparison-operator'],
      ],
      type: 'BinaryExpression',
      source: 'if (a < b) x()',
      text: 'a < b',
    },
    {
      expected: [
        ['true', 'O1', 'comparison-operator'],
        ['false', 'O1', 'comparison-operator'],
      ],
      source: "function f(s: string) { if (s === 'x') x() }",
      type: 'BinaryExpression',
      text: "s === 'x'",
    },
    {
      expected: [
        ['true', 'O1', 'comparison-operator'],
        ['false', 'proven-comparison', null],
      ],
      source: 'function f(user: { id: 1 }) { if (user === null) x() }',
      type: 'BinaryExpression',
      text: 'user === null',
    },
    {
      expected: [
        ['true', 'loop-running', null],
        ['false', 'comparison-region', 'comparison-operator'],
      ],
      source:
        'function f(list: string[]) { while (list.length > 0) list.pop() }',
      type: 'BinaryExpression',
      text: 'list.length > 0',
    },
    {
      expected: [
        ['true', 'lower-bound', null],
        ['false', 'comparison-region', 'comparison-operator'],
      ],
      source: 'function f(list: string[]) { if (list.length > -1) x() }',
      type: 'BinaryExpression',
      text: 'list.length > -1',
    },
    {
      expected: [
        ['true', 'loop-running', null],
        ['false', 'lower-bound', null],
      ],
      source: 'function f(list: string[]) { while (list.length < -1) x() }',
      type: 'BinaryExpression',
      text: 'list.length < -1',
    },
    {
      expected: [
        ['true', 'O1', 'logical-operator'],
        ['false', 'O1', 'logical-operator'],
      ],
      source: 'k = !(a || b)',
      type: 'UnaryExpression',
      text: '!(a || b)',
    },
    {
      expected: [
        ['true', 'literal-truth', null],
        ['false', 'O7', 'boolean-literal'],
      ],
      source: 'if (true) z()',
      type: 'Literal',
      text: 'true',
    },
    {
      expected: [
        ['true', 'constant-test', null],
        ['false', 'literal-truth', null],
      ],
      source: 'if (null) w()',
      type: 'Literal',
      text: 'null',
    },
    {
      expected: [
        ['true', 'literal-truth', null],
        ['false', 'constant-test', null],
      ],
      source: 'if (/a/) w()',
      type: 'Literal',
      text: '/a/',
    },
    {
      expected: [
        ['true', 'literal-truth', null],
        ['false', 'constant-test', null],
      ],
      source: 'while (1) w()',
      type: 'Literal',
      text: '1',
    },
    {
      expected: [
        ['true', 'loop-running', null],
        ['false', 'literal-truth', null],
      ],
      source: 'while (0) w()',
      type: 'Literal',
      text: '0',
    },
    {
      expected: [
        ['true', 'O1', 'number-literal'],
        ['false', 'literal-truth', null],
      ],
      type: 'UnaryExpression',
      source: 'k = !-1',
      text: '!-1',
    },
    {
      expected: [
        ['true', 'O3', 'logical-operator'],
        ['false', 'O3', 'logical-operator'],
      ],
      source: 'if (!x && y) run()',
      type: 'UnaryExpression',
      text: '!x',
    },
    {
      expected: [['true', 'O3', 'logical-operator']],
      source: 'k = [!x && y]',
      type: 'UnaryExpression',
      text: '!x',
    },
    {
      source: 'k = [y && !x]',
      type: 'UnaryExpression',
      expected: [],
      text: '!x',
    },
    {
      source: 'function f(items: string[]) { if (items) run() }',
      expected: [['true', 'typed-constant', null]],
      type: 'Identifier',
      text: 'items',
    },
    {
      expected: [['true', 'loop-running', null]],
      source: 'while (ready) step()',
      type: 'Identifier',
      text: 'ready',
    },
    {
      expected: [
        ['true', 'O13', null],
        ['false', 'loop-running', null],
      ],
      source: 'for (;;) { if (done()) break; tick() }',
      type: 'CallExpression',
      text: 'done()',
    },
    {
      source: 'function f(x: boolean | undefined) { if (x ?? false) {} }',
      expected: [['true', 'R3', 'boolean-literal']],
      type: 'LogicalExpression',
      text: 'x ?? false',
    },
    {
      source: 'x = items.sort(r => { if (r.x) return 0; return 1 })',
      expected: [['true', 'O12', null]],
      type: 'MemberExpression',
      text: 'r.x',
    },
    {
      type: 'UnaryExpression',
      source: 'm = !!value',
      text: '!value',
      expected: [],
    },
  ])(
    'names the rule of each skipped constant of $source',
    ({ expected, source, type, text }) => {
      let { context, find } = createTestContext(source)
      let { skipped } = getConditionConstants(
        find(type, text),
        createRunContext(context),
      )

      expect(
        skipped.map(replacement => [
          replacement.text,
          replacement.skip!.rule,
          replacement.skip!.by?.mutator ?? null,
        ]),
      ).toEqual(expected)
    },
  )
})
