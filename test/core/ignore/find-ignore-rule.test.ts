import { describe, expect, it } from 'vitest'

import type { IgnoreRule } from '../../../types/ignore-rule'

import { findIgnoreRule } from '../../../core/ignore/find-ignore-rule'

/**
 * Builds a rule of the tests. Offsets of next-line rules span line 3.
 *
 * @param kind - Precedence class of the rule.
 * @param order - Offset of the directive comment.
 * @param overrides - Fields that differ from the defaults.
 * @returns Ignore rule.
 */
function createRule(
  kind: IgnoreRule['kind'],
  order: number,
  overrides: Partial<IgnoreRule> = {},
): IgnoreRule {
  return {
    source: { directive: 'mootant-ignore-file', column: 1, line: 1 },
    line: kind === 'next-line' ? 3 : null,
    reason: `${kind} ${order}`,
    mutators: null,
    start: 20,
    end: 40,
    order,
    kind,
    ...overrides,
  }
}

/**
 * Mutant of `string-literal` that starts at offset 30 on line 3.
 */
const TARGET = { mutator: 'string-literal', start: 30, line: 3 }

describe('findIgnoreRule', () => {
  it('returns null without rules', () => {
    expect(findIgnoreRule([], TARGET)).toBeNull()
  })

  it.each([
    [['file', 'region', 'next-line'], 'next-line 3'],
    [['next-line', 'region', 'file'], 'next-line 1'],
    [['file', 'region'], 'region 2'],
    [['region', 'file'], 'region 1'],
  ] as const)('prefers the most specific kind among %j', (kinds, reason) => {
    let rules = kinds.map((kind, index) => createRule(kind, index + 1))

    expect(findIgnoreRule(rules, TARGET)?.reason).toBe(reason)
  })

  it.each([
    [[1, 5, 3], 'region 5'],
    [[5, 1, 3], 'region 5'],
    [[3, 1, 5], 'region 5'],
  ])(
    'prefers the later directive among rules of one kind at %j',
    (orders, reason) => {
      let rules = orders.map(order => createRule('region', order))

      expect(findIgnoreRule(rules, TARGET)?.reason).toBe(reason)
    },
  )

  it.each([
    [null, 'region 1'],
    [['string-literal'], 'region 1'],
    [['number-literal', 'string-literal'], 'region 1'],
    [['number-literal'], undefined],
    [[], undefined],
  ])('filters rules listing %j by mutator', (mutators, reason) => {
    let rules = [createRule('region', 1, { mutators })]

    expect(findIgnoreRule(rules, TARGET)?.reason).toBe(reason)
  })

  it('compares mutator ids exactly', () => {
    let rules = [createRule('file', 1, { mutators: ['acme/string-literal'] })]

    expect(findIgnoreRule(rules, TARGET)).toBeNull()
  })

  it.each([
    [19, undefined],
    [20, 'region 1'],
    [39, 'region 1'],
    [40, undefined],
  ])(
    'covers a mutant starting at %i with a region from 20 to 40 as %j',
    (start, reason) => {
      let rule = createRule('region', 1)

      expect(findIgnoreRule([rule], { ...TARGET, start })?.reason).toBe(reason)
    },
  )

  it.each([
    [2, undefined],
    [3, 'next-line 1'],
    [4, undefined],
  ])(
    'covers a mutant on line %i with a next-line rule of line 3 as %j',
    (line, reason) => {
      let rule = createRule('next-line', 1, { start: 0, end: 0 })

      expect(findIgnoreRule([rule], { ...TARGET, line })?.reason).toBe(reason)
    },
  )

  it('skips rules that do not cover the mutant when looking for a winner', () => {
    let file = createRule('file', 1, { start: 0, end: 100 })
    let rules = [
      createRule('next-line', 2, { line: 7 }),
      file,
      createRule('region', 3, { start: 50, end: 60 }),
    ]

    expect(findIgnoreRule(rules, TARGET)).toBe(file)
  })
})
