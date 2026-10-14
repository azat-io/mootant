import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { getLiteralFlip } from '../../../../core/mutators/shared/get-literal-flip'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getLiteralFlip', () => {
  it.each<{
    expected: boolean | null
    setup: TestContextSetup
    type: Node['type']
    source: string
    text: string
  }>([
    {
      source: 'if (true) z()',
      type: 'Literal',
      expected: false,
      text: 'true',
      setup: {},
    },
    {
      source: 'while (true) { if (step()) break }',
      type: 'Literal',
      expected: false,
      text: 'true',
      setup: {},
    },
    {
      source: 'do { work() } while (false)',
      type: 'Literal',
      expected: null,
      text: 'false',
      setup: {},
    },
    {
      source: 'do { work() } while (false)',
      setup: { timeouts: true },
      type: 'Literal',
      expected: true,
      text: 'false',
    },
    {
      source: 'while (!true) {}',
      type: 'Literal',
      expected: null,
      text: 'true',
      setup: {},
    },
    {
      source: 'f(!false)',
      type: 'Literal',
      expected: true,
      text: 'false',
      setup: {},
    },
    {
      source: 'if (1) z()',
      type: 'Literal',
      expected: null,
      text: '1',
      setup: {},
    },
    {
      source: 'if (0) z()',
      type: 'Literal',
      expected: true,
      text: '0',
      setup: {},
    },
    {
      source: 'while (0) z()',
      type: 'Literal',
      expected: null,
      text: '0',
      setup: {},
    },
    {
      type: 'UnaryExpression',
      source: 'if (-1) z()',
      expected: false,
      text: '-1',
      setup: {},
    },
    {
      type: 'UnaryExpression',
      source: 'if (-1n) z()',
      expected: false,
      text: '-1n',
      setup: {},
    },
    {
      source: "if ('') z()",
      type: 'Literal',
      expected: true,
      text: "''",
      setup: {},
    },
    {
      source: "while ('') z()",
      type: 'Literal',
      expected: true,
      text: "''",
      setup: {},
    },
    {
      source: "if ('a') z()",
      type: 'Literal',
      expected: false,
      text: "'a'",
      setup: {},
    },
    {
      type: 'TemplateLiteral',
      source: 'if (``) z()',
      expected: true,
      text: '``',
      setup: {},
    },
    {
      source: `if (\`a\${b}\`) z()`,
      type: 'TemplateLiteral',
      text: `\`a\${b}\``,
      expected: null,
      setup: {},
    },
    {
      source: 'if (x === true) z()',
      type: 'Literal',
      expected: null,
      text: 'true',
      setup: {},
    },
    {
      source: 'if (ok && true) z()',
      type: 'Literal',
      expected: null,
      text: 'true',
      setup: {},
    },
    {
      source: "throw new Error(c ? 'a' : b)",
      type: 'Literal',
      expected: null,
      text: "'a'",
      setup: {},
    },
    {
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: null,
      text: 'true',
      setup: {},
    },
    {
      setup: { disabled: ['condition'] },
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: null,
      text: 'true',
    },
    {
      setup: { disabled: ['condition'] },
      source: 'x = ok ? true : 1',
      type: 'Literal',
      expected: false,
      text: 'true',
    },
    {
      source: 'x = rows.filter(r => { if (r.x) return true; return false })',
      type: 'Literal',
      expected: null,
      text: 'false',
      setup: {},
    },
    {
      source: "function f(title: string) { x = title || 'a' }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      setup: {},
    },
    {
      source: "function f(name: string | undefined) { x = name || 'anon' }",
      type: 'Literal',
      text: "'anon'",
      expected: null,
      setup: {},
    },
    {
      source: "function f(name: string | undefined) { x = name || 'anon' }",
      setup: { disabled: ['logical-operator'] },
      type: 'Literal',
      expected: false,
      text: "'anon'",
    },
    { source: 'x = -1', type: 'Literal', expected: null, text: '1', setup: {} },
    {
      source: 'x = -(0) ? a : b',
      type: 'Literal',
      expected: true,
      text: '0',
      setup: {},
    },
    {
      type: 'Identifier',
      source: 'x = y',
      expected: null,
      text: 'y',
      setup: {},
    },
  ])('flips $source', ({ expected, source, setup, type, text }) => {
    let { context, find } = createTestContext(source, setup)

    expect(getLiteralFlip(find(type, text), createRunContext(context))).toBe(
      expected,
    )
  })
})
