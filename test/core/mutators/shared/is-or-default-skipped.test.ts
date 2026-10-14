import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { LiteralValue } from '../../../../core/mutators/shared/get-literal-value'
import type { TestContextSetup } from '../../../helpers/create-test-context'

import { isOrDefaultSkipped } from '../../../../core/mutators/shared/is-or-default-skipped'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isOrDefaultSkipped', () => {
  it.each<{
    setup: TestContextSetup
    value: LiteralValue
    type: Node['type']
    expected: boolean
    source: string
    text: string
  }>([
    {
      source: "function f(t: string) { x = t || 'a' }",
      type: 'Literal',
      expected: true,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = n || 'anon' }",
      type: 'Literal',
      text: "'anon'",
      expected: true,
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = n || 'anon' }",
      setup: { disabled: ['logical-operator'] },
      type: 'Literal',
      expected: false,
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
      expected: false,
      text: "'anon'",
      value: '',
      setup: {},
    },
    {
      source: 'function f(n: number) { x = n || -1 }',
      type: 'UnaryExpression',
      expected: true,
      text: '-1',
      setup: {},
      value: 0,
    },
    {
      source: 'function f(n: bigint) { x = n || -1n }',
      type: 'UnaryExpression',
      expected: true,
      text: '-1n',
      value: 0n,
      setup: {},
    },
    {
      source: 'function f(n: number) { x = n || 1 }',
      type: 'Literal',
      expected: false,
      text: '1',
      setup: {},
      value: 2,
    },
    {
      source: 'function f(v: boolean | undefined) { x = v || true }',
      type: 'Literal',
      expected: true,
      text: 'true',
      value: false,
      setup: {},
    },
    {
      source: "function f(t: string) { if (t || 'a') {} }",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = 'a' || t }",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = t ?? 'a' }",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(t: string) { x = t && 'a' }",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "x = y || 'a'",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
    {
      source: "function f(n: string | undefined) { x = (n && m) || 'a' }",
      type: 'Literal',
      expected: false,
      text: "'a'",
      value: '',
      setup: {},
    },
  ])('answers $source', ({ expected, source, value, setup, type, text }) => {
    let { context, find } = createTestContext(source, setup)

    expect(
      isOrDefaultSkipped(find(type, text), value, createRunContext(context)),
    ).toBe(expected)
  })
})
