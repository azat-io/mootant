import { describe, expect, it } from 'vitest'

import type { CanonicalFalsyDefault } from '../../../../core/mutators/shared/get-canonical-falsy-default'

import { getCanonicalFalsyDefault } from '../../../../core/mutators/shared/get-canonical-falsy-default'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getCanonicalFalsyDefault', () => {
  it.each<{
    expected: CanonicalFalsyDefault | null
    source: string
    file?: string
  }>([
    {
      source: "function f(title: string) { x = title || '' }",
      expected: { because: null },
    },
    {
      source: 'function f(ok: boolean) { x = ok && false }',
      expected: { because: null },
    },
    {
      source: 'function f(v: bigint) { x = v || 0n }',
      expected: { because: null },
    },
    {
      source: "function f(title?: string) { x = title || '' }",
      expected: null,
    },
    {
      source: "function f(title: string) { x = title || 'none' }",
      expected: null,
    },
    {
      source: 'function f(count: number) { x = count || 0 }',
      expected: null,
    },
    {
      source: 'export function f(done, total) { x = done / total || 0 }',
      file: 'example.js',
      expected: null,
    },
    {
      source: 'function f(list: string[]) { x = list.length || 0 }',
      expected: { because: 'a length is never negative' },
    },
    {
      source: 'function f(list: string[]) { x = list?.length || 0 }',
      expected: null,
    },
    {
      source:
        'function f(items?: string[]) { x = (items?.length as number) || 0 }',
      expected: null,
    },
    {
      source: [
        'function f(list: string[]) {',
        '  let count = 0',
        '  for (let item of list) count++',
        '  x = count && 0',
        '}',
      ].join('\n'),
      expected: { because: '`count` starts at 0 and only grows' },
    },
  ])('answers the operands of $source', ({ expected, source, file }) => {
    let { context, find } = createTestContext(source, { file })
    let { right, left } = find('LogicalExpression')

    expect(getCanonicalFalsyDefault(left, right, context)).toStrictEqual(
      expected,
    )
  })

  it.each<{ expected: CanonicalFalsyDefault | null; source: string }>([
    {
      source: 'function f(list: string[]) { list.length ||= 0 }',
      expected: { because: 'a length is never negative' },
    },
    {
      source: [
        'function f(done: number, total: number) {',
        '  let value = done / total',
        '  value &&= 0',
        '}',
      ].join('\n'),
      expected: null,
    },
  ])('answers the target of $source', ({ expected, source }) => {
    let { context, find } = createTestContext(source)
    let { right, left } = find('AssignmentExpression')

    expect(getCanonicalFalsyDefault(left, right, context)).toStrictEqual(
      expected,
    )
  })
})
