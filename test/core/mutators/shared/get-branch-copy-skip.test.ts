import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { LiteralValue } from '../../../../core/mutators/shared/get-literal-value'
import type { SkipRuleId } from '../../../../types/mutant/skip-rule-id'

import { getBranchCopySkip } from '../../../../core/mutators/shared/get-branch-copy-skip'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('getBranchCopySkip', () => {
  it.each<{
    expected: SkipRuleId | null
    value: LiteralValue
    type: Node['type']
    source: string
    text: string
  }>([
    {
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: 'O19',
      text: 'true',
      value: false,
    },
    {
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: 'O19',
      text: 'false',
      value: true,
    },
    {
      source:
        'function canEdit(u: User): boolean { if (u.isAdmin) return true; return false }',
      type: 'Literal',
      expected: 'O19',
      text: 'false',
      value: true,
    },
    {
      source: 'x = flag ? 1 : 0',
      type: 'Literal',
      expected: null,
      text: '1',
      value: 2,
    },
    {
      source: 'x = flag ? 1 : 0',
      type: 'Literal',
      expected: 'O19',
      text: '0',
      value: 1,
    },
    {
      source: 'function f(x: number) { y = x >= 5 ? 0 : 1 }',
      type: 'Literal',
      expected: 'R5',
      text: '0',
      value: 1,
    },
    {
      source: "function f(x: number) { y = x >= 5 ? '' : 'small' }",
      type: 'Literal',
      text: "'small'",
      expected: 'R5',
      value: '',
    },
    {
      source: "x = active ? 'on' : ''",
      type: 'Literal',
      expected: 'O19',
      text: "'on'",
      value: '',
    },
    {
      source: "function f() { if (ok) { return 'yes' } else { return '' } }",
      type: 'Literal',
      expected: 'O19',
      text: "'yes'",
      value: '',
    },
    {
      source: 'function f(ok, a: boolean) { return ok ? a : false }',
      type: 'Literal',
      expected: 'R5',
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { x = ok ? a : false }',
      type: 'Literal',
      expected: null,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { if (ok ? a : false) {} }',
      type: 'Literal',
      expected: 'R5',
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a): boolean { return ok ? a : false }',
      type: 'Literal',
      expected: 'R5',
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { return ok ? a : false }',
      type: 'Literal',
      expected: null,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(): boolean { if (ok) return a; return false }',
      type: 'Literal',
      expected: 'R5',
      text: 'false',
      value: true,
    },
    {
      source: 'function f() { if (ok) return a; return false }',
      type: 'Literal',
      expected: null,
      text: 'false',
      value: true,
    },
    {
      source:
        'function f(): boolean | null { if (ok) return false; return null }',
      type: 'Literal',
      expected: null,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { x = ok ? a : 0 }',
      type: 'Literal',
      expected: null,
      text: '0',
      value: 1,
    },
    { source: 'x = 1', type: 'Literal', expected: null, text: '1', value: 2 },
  ])('answers $source for $type', ({ expected, source, value, type, text }) => {
    let { context, find } = createTestContext(source)

    expect(
      getBranchCopySkip(find(type, text), { value }, createRunContext(context))
        ?.rule ?? null,
    ).toBe(expected)
  })

  it.each<[string, SkipRuleId | null]>([
    ['function f(x: number) { y = x >= 5 ? 0 : 1 }', 'R5'],
    [
      [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator, condition',
        '  y = x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      null,
    ],
    [
      [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator',
        '  y = x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      'R5',
    ],
    [
      [
        'function f(x: number) {',
        '  // mootant-ignore-next-line',
        '  y = x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      'R5',
    ],
  ])('follows ignore comments in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      getBranchCopySkip(
        find('Literal', '0'),
        { value: 1 },
        createRunContext(context),
      )?.rule ?? null,
    ).toBe(expected)
  })

  it('keeps a flip whose test the owner moves nowhere', () => {
    let { context, find } = createTestContext(
      ['// mootant-ignore-next-line condition', 'x = ok ? true : false'].join(
        '\n',
      ),
    )

    expect(
      getBranchCopySkip(
        find('Literal', 'true'),
        { value: false },
        createRunContext(context),
      )?.rule,
    ).toBe('O19')
  })

  it.each<[string, string, SkipRuleId | null]>([
    [`x = c ? \`a\${y}\` : \`\${y}\``, `\`\${y}\``, 'O19'],
    [`x = c ? \`a\${y}\` : \`b\``, `\`\${y}\``, null],
  ])('compares the text of a template in %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      getBranchCopySkip(
        find('TemplateLiteral', `\`a\${y}\``),
        { text },
        createRunContext(context),
      )?.rule ?? null,
    ).toBe(expected)
  })
})
