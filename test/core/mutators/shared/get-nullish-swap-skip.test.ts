import { describe, expect, it } from 'vitest'

import type { SkipNote } from '../../../../types/mutant/skip-note'

import { getNullishSwapSkip } from '../../../../core/mutators/shared/get-nullish-swap-skip'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Skip of a swap that differs only on falsy values the `nullishSwap` option
 * does not count.
 */
const NULLISH_SWAP: SkipNote = {
  reason:
    '?? and || differ here only on falsy values that the nullishSwap option does not count, such as the default itself',
  rule: 'nullish-swap',
}

describe('getNullishSwapSkip', () => {
  it.each<[string, 'distinguishing' | 'always', SkipNote | null]>([
    [
      'function f(n?: number) { x = n?.toFixed(2) || null }',
      'always',
      {
        reason:
          'the left side is never falsy when defined (`toFixed` never returns an empty string), so || and ?? agree',
        rule: 'never-falsy',
      },
    ],
    [
      'function f(name: string | null) { x = name || "a" }',
      'distinguishing',
      null,
    ],
    [
      'function f(count: number | null) { x = count || 0 }',
      'distinguishing',
      NULLISH_SWAP,
    ],
    ['function f(count: number | null) { x = count || 0 }', 'always', null],
    [
      'function f(count: number | null) { x = count ?? 0 }',
      'distinguishing',
      NULLISH_SWAP,
    ],
  ])('answers %s in the %s mode', (source, mode, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      getNullishSwapSkip(find('LogicalExpression'), context, mode),
    ).toStrictEqual(expected)
  })
})
