import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { LiteralValue } from '../../../../core/mutators/shared/get-literal-value'
import type { TestContextSetup } from '../../../helpers/create-test-context'
import type { SkipRuleId } from '../../../../types/skip-rule-id'

import { getOrDefaultSkip } from '../../../../core/mutators/shared/get-or-default-skip'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getOrDefaultSkip', () => {
  it.each<{
    expected: SkipRuleId | null
    setup: TestContextSetup
    value: LiteralValue
    type: Node['type']
    source: string
    text: string
  }>([
    {
      source: "function f(t: string) { x = t || 'a' }",
      type: 'Literal',
      expected: 'O16',
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = n || 'anon' }",
      type: 'Literal',
      text: "'anon'",
      expected: 'R7',
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = n || 'anon' }",
      setup: { disabled: ['logical-operator'] },
      type: 'Literal',
      expected: null,
      text: "'anon'",
      value: '',
    },
    {
      source: [
        'function f(n: string | undefined) {',
        '  // mootant-ignore-next-line logical-operator',
        "  x = n || 'anon'",
        '}',
      ].join('\n'),
      type: 'Literal',
      expected: null,
      text: "'anon'",
      value: '',
      setup: {},
    },
    {
      source: 'function f(n: number) { x = n || -1 }',
      type: 'UnaryExpression',
      expected: 'O16',
      text: '-1',
      setup: {},
      value: 0,
    },
    {
      source: 'function f(n: bigint) { x = n || -1n }',
      type: 'UnaryExpression',
      expected: 'O16',
      text: '-1n',
      value: 0n,
      setup: {},
    },
    {
      source: 'function f(n: number) { x = n || 1 }',
      type: 'Literal',
      expected: null,
      text: '1',
      setup: {},
      value: 2,
    },
    {
      source: 'function f(v: boolean | undefined) { x = v || true }',
      type: 'Literal',
      expected: 'R7',
      text: 'true',
      value: false,
      setup: {},
    },
    {
      source: "function f(t: string) { if (t || 'a') {} }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = 'a' || t }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = t ?? 'a' }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = t && 'a' }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "x = y || 'a'",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = (n && m) || 'a' }",
      type: 'Literal',
      expected: null,
      text: "'a'",
      value: '',
      setup: {},
    },
  ])('answers $source', ({ expected, source, value, setup, type, text }) => {
    let { context, find } = createTestContext(source, setup)

    expect(
      getOrDefaultSkip(find(type, text), value, createRunContext(context))
        ?.rule ?? null,
    ).toBe(expected)
  })
})
