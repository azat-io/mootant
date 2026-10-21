import { describe, expect, it } from 'vitest'

import type { SkipRuleId } from '../../../types/mutant/skip-rule-id'
import type { SkipRule } from '../../../types/mutant/skip-rule'

import { skipRules } from '../../../core/skips/skip-rules'

describe('skipRules', () => {
  it.each<[SkipRuleId, SkipRule]>([
    ['O16', { category: 'owned', heuristic: true }],
    ['R7', { category: 'subsumed', heuristic: true }],
    ['O11', { category: 'owned', heuristic: false }],
    ['error-message', { category: 'noise', heuristic: true }],
    ['never-falsy', { category: 'equivalent', heuristic: true }],
    ['named-groups', { category: 'equivalent', heuristic: true }],
    ['joined-array', { category: 'equivalent', heuristic: false }],
  ])('registers %s as %o', (id, expected) => {
    expect(skipRules[id]).toStrictEqual(expected)
  })
})
