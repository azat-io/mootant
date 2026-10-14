import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isNoOpCallbackLiteral } from '../../../../core/mutators/shared/is-no-op-callback-literal'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isNoOpCallbackLiteral', () => {
  it.each<{
    type: Node['type']
    expected: boolean
    source: string
    value: unknown
    text: string
  }>([
    {
      source: 'rows.filter(r => { if (r.x) return true; return false })',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: 'rows.sort(r => { if (r.x) return false; return 1 })',
      type: 'Literal',
      expected: true,
      text: '1',
      value: 0,
    },
    {
      source: 'rows.filter(r => { if (r.x) return true; return false })',
      type: 'Literal',
      expected: false,
      text: 'true',
      value: false,
    },
    {
      source: 'rows.sort(r => { if (r.x) return -1; return 0 })',
      type: 'UnaryExpression',
      expected: true,
      text: '-1',
      value: 0,
    },
    {
      source: 'rows.toSorted(r => { if (r.x) return -1; return 0 })',
      type: 'UnaryExpression',
      expected: false,
      text: '-1',
      value: 0,
    },
    {
      source: 'rows.sort(r => { if (r.x) return 1; return (-1) })',
      type: 'UnaryExpression',
      expected: false,
      text: '-1',
      value: 0,
    },
    {
      source: 'rows.map(r => { if (r.x) return true; return false })',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: "rows.sort(r => { audit(r); if (r.ok) return 'yes'; return '' })",
      value: 'mootant',
      type: 'Literal',
      expected: false,
      text: "''",
    },
    {
      source: "rows.sort(r => { if (r.ok) return 'yes'; return '' })",
      value: 'mootant',
      type: 'Literal',
      expected: true,
      text: "''",
    },
    {
      source: 'rows.sort(r => { foo(); return false })',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: 'rows.sort(r => false)',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
  ])('answers $source for $type', ({ expected, source, value, type, text }) => {
    let { context, find } = createTestContext(source)

    expect(isNoOpCallbackLiteral(find(type, text), value, context)).toBe(
      expected,
    )
  })

  it('rejects a returned literal outside functions', () => {
    let { context, find } = createTestContext('return true', {
      file: 'example.cjs',
    })

    expect(isNoOpCallbackLiteral(find('Literal', 'true'), false, context)).toBe(
      false,
    )
  })
})
