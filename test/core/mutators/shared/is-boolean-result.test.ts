import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import { isBooleanResult } from '../../../../core/mutators/shared/is-boolean-result'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBooleanResult', () => {
  it.each<{
    type: Node['type']
    expected: boolean
    source: string
    text: string
  }>([
    {
      source: 'function f(s: string): boolean { return a }',
      type: 'Identifier',
      expected: true,
      text: 'a',
    },
    {
      source: 'rows.filter(r => a)',
      type: 'Identifier',
      expected: true,
      text: 'a',
    },
    {
      source: 'function f() { return a < b }',
      type: 'BinaryExpression',
      expected: true,
      text: 'a < b',
    },
    {
      source: 'function f(): string { return a }',
      type: 'Identifier',
      expected: false,
      text: 'a',
    },
    {
      source: 'function* f(): boolean { return a }',
      type: 'Identifier',
      expected: false,
      text: 'a',
    },
    { type: 'Identifier', source: 'x = a', expected: false, text: 'a' },
  ])('answers $source', ({ expected, source, type, text }) => {
    let { context, find } = createTestContext(source)

    expect(isBooleanResult(find(type, text), context)).toBe(expected)
  })
})
