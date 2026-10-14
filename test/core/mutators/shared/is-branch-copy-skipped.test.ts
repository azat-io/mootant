import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { LiteralValue } from '../../../../core/mutators/shared/get-literal-value'

import { isBranchCopySkipped } from '../../../../core/mutators/shared/is-branch-copy-skipped'
import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { createTestContext } from '../../../helpers/create-test-context'

describe('isBranchCopySkipped', () => {
  it.each<{
    value: LiteralValue
    type: Node['type']
    expected: boolean
    source: string
    text: string
  }>([
    {
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: true,
      text: 'true',
      value: false,
    },
    {
      source: 'x = ok ? true : false',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source:
        'function canEdit(u: User): boolean { if (u.isAdmin) return true; return false }',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source: 'x = flag ? 1 : 0',
      type: 'Literal',
      expected: false,
      text: '1',
      value: 2,
    },
    {
      source: 'x = flag ? 1 : 0',
      type: 'Literal',
      expected: true,
      text: '0',
      value: 1,
    },
    {
      source: 'function f(x: number) { y = x >= 5 ? 0 : 1 }',
      type: 'Literal',
      expected: true,
      text: '0',
      value: 1,
    },
    {
      source: "function f(x: number) { y = x >= 5 ? '' : 'small' }",
      type: 'Literal',
      text: "'small'",
      expected: true,
      value: '',
    },
    {
      source: "x = active ? 'on' : ''",
      type: 'Literal',
      expected: true,
      text: "'on'",
      value: '',
    },
    {
      source: "function f() { if (ok) { return 'yes' } else { return '' } }",
      type: 'Literal',
      expected: true,
      text: "'yes'",
      value: '',
    },
    {
      source: 'function f(ok, a: boolean) { return ok ? a : false }',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { x = ok ? a : false }',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { if (ok ? a : false) {} }',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a): boolean { return ok ? a : false }',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { return ok ? a : false }',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(): boolean { if (ok) return a; return false }',
      type: 'Literal',
      expected: true,
      text: 'false',
      value: true,
    },
    {
      source: 'function f() { if (ok) return a; return false }',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source:
        'function f(): boolean | null { if (ok) return false; return null }',
      type: 'Literal',
      expected: false,
      text: 'false',
      value: true,
    },
    {
      source: 'function f(ok, a) { x = ok ? a : 0 }',
      type: 'Literal',
      expected: false,
      text: '0',
      value: 1,
    },
    { source: 'x = 1', type: 'Literal', expected: false, text: '1', value: 2 },
  ])('answers $source for $type', ({ expected, source, value, type, text }) => {
    let { context, find } = createTestContext(source)

    expect(
      isBranchCopySkipped(
        find(type, text),
        { value },
        createRunContext(context),
      ),
    ).toBe(expected)
  })

  it.each<[string, boolean]>([
    ['function f(x: number) { y = x >= 5 ? 0 : 1 }', true],
    [
      [
        'function f(x: number) {',
        '  // mootant-ignore-next-line comparison-operator',
        '  y = x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      false,
    ],
    [
      [
        'function f(x: number) {',
        '  // mootant-ignore-next-line',
        '  y = x >= 5 ? 0 : 1',
        '}',
      ].join('\n'),
      true,
    ],
  ])('follows ignore comments in %s', (source, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      isBranchCopySkipped(
        find('Literal', '0'),
        { value: 1 },
        createRunContext(context),
      ),
    ).toBe(expected)
  })

  it('keeps a flip whose test the owner moves nowhere', () => {
    let { context, find } = createTestContext(
      ['// mootant-ignore-next-line condition', 'x = ok ? true : false'].join(
        '\n',
      ),
    )

    expect(
      isBranchCopySkipped(
        find('Literal', 'true'),
        { value: false },
        createRunContext(context),
      ),
    ).toBe(true)
  })

  it.each<[string, string, boolean]>([
    [`x = c ? \`a\${y}\` : \`\${y}\``, `\`\${y}\``, true],
    [`x = c ? \`a\${y}\` : \`b\``, `\`\${y}\``, false],
  ])('compares the text of a template in %s', (source, text, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      isBranchCopySkipped(
        find('TemplateLiteral', `\`a\${y}\``),
        { text },
        createRunContext(context),
      ),
    ).toBe(expected)
  })
})
