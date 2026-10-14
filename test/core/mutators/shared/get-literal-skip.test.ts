import type { Node } from 'oxc-parser'

import { describe, expect, it } from 'vitest'

import type { LiteralChange } from '../../../../types/literal-change'
import type { SkipRuleId } from '../../../../types/skip-rule-id'
import type { SkipNote } from '../../../../types/skip-note'

import { createRunContext } from '../../../../core/mutators/shared/create-run-context'
import { getLiteralSkip } from '../../../../core/mutators/shared/get-literal-skip'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Note that the own rules of a test return.
 */
const OWN_NOTE: SkipNote = { reason: 'own rule', rule: 'case-label' }

describe('getLiteralSkip', () => {
  it.each<{
    expected: SkipRuleId | null
    change: LiteralChange
    type: Node['type']
    source: string
    text: string
  }>([
    {
      source: 'declare let n: number; x = n === 1',
      change: { value: 2 },
      type: 'Literal',
      expected: 'O4',
      text: '1',
    },
    {
      source: 'declare let ok: boolean; x = ok && !true',
      change: { value: false },
      type: 'Literal',
      expected: 'O3',
      text: 'true',
    },
    {
      expected: 'void-operand',
      change: { value: 1 },
      source: 'x = void 0',
      type: 'Literal',
      text: '0',
    },
    {
      source: "throw new Error('bad')",
      expected: 'error-message',
      change: { value: '' },
      type: 'Literal',
      text: "'bad'",
    },
    {
      source: `throw new Error(\`bad \${x}\`)`,
      change: { text: `\`\${x}\`` },
      expected: 'error-message',
      type: 'TemplateLiteral',
      text: `\`bad \${x}\``,
    },
    {
      source: 'throw new Error(0)',
      change: { value: 1 },
      type: 'Literal',
      expected: null,
      text: '0',
    },
    {
      source: `x = c ? \`a\${y}\` : \`\${y}\``,
      change: { text: `\`\${y}\`` },
      type: 'TemplateLiteral',
      text: `\`a\${y}\``,
      expected: 'O19',
    },
    {
      source: `x = c ? \`a\${y}\` : \`b\``,
      change: { text: `\`\${y}\`` },
      type: 'TemplateLiteral',
      text: `\`a\${y}\``,
      expected: null,
    },
    {
      expected: 'loop-running',
      source: 'while (0) {}',
      change: { value: 1 },
      type: 'Literal',
      text: '0',
    },
    {
      source: "while ('') {}",
      change: { value: 'x' },
      type: 'Literal',
      expected: null,
      text: "''",
    },
    {
      source: 'x = ok ? true : false',
      change: { value: false },
      expected: 'O19',
      type: 'Literal',
      text: 'true',
    },
    {
      source: 'items.sort((a, c) => { if (a) return false; return true })',
      change: { value: false },
      expected: 'O12',
      type: 'Literal',
      text: 'true',
    },
    {
      source: "function f(t: string) { x = t || 'a' }",
      change: { value: '' },
      expected: 'O16',
      type: 'Literal',
      text: "'a'",
    },
    {
      change: { value: 2 },
      type: 'Literal',
      source: 'x = 1',
      expected: null,
      text: '1',
    },
  ])(
    'answers $source for $text',
    ({ expected, source, change, type, text }) => {
      let { context, find } = createTestContext(source)

      expect(
        getLiteralSkip(find(type, text), { change }, createRunContext(context))
          ?.rule ?? null,
      ).toBe(expected)
    },
  )

  it.each<[string, string, Node['type']]>([
    ['declare let n: number; x = n === 1', 'n === 1', 'BinaryExpression'],
    ['declare let ok: boolean; x = ok && !1', 'ok && !1', 'LogicalExpression'],
  ])('names the owner of an operand in %s', (source, owner, type) => {
    let { context, find } = createTestContext(source)

    expect(
      getLiteralSkip(
        find('Literal', '1'),
        { change: { value: 2 } },
        createRunContext(context),
      )?.by?.node,
    ).toBe(find(type, owner))
  })

  it.each<[string, SkipRuleId]>([
    ['declare let n: number; x = n === 1', 'O4'],
    ['x = ok ? 1 : 2', 'case-label'],
    ['x = 1', 'case-label'],
  ])('checks the own rules after the operand rules in %s', (source, rule) => {
    let { context, find } = createTestContext(source)

    expect(
      getLiteralSkip(
        find('Literal', '1'),
        { getOwnSkip: () => OWN_NOTE, change: { value: 2 } },
        createRunContext(context),
      )?.rule,
    ).toBe(rule)
  })
})
