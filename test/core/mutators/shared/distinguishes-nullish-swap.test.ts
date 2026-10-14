import { describe, expect, it } from 'vitest'

import { distinguishesNullishSwap } from '../../../../core/mutators/shared/distinguishes-nullish-swap'
import { createTestContext } from '../../../helpers/create-test-context'

describe('distinguishesNullishSwap', () => {
  it.each<[string, 'distinguishing' | 'always', boolean]>([
    ["let a: string | undefined; x = a ?? 'anon'", 'distinguishing', true],
    ["let a: string | undefined; x = a ?? ''", 'distinguishing', false],
    ['let a: string | undefined; x = a ?? ``', 'distinguishing', false],
    ['let a: number | null; x = a ?? 0', 'distinguishing', false],
    ['let a: number | null; x = a ?? 0', 'always', true],
    ['let a: number | null; x = a ?? 1', 'distinguishing', true],
    ['let a: bigint | null; x = a ?? 0n', 'always', false],
    ['let a: boolean | null; x = a ?? false', 'distinguishing', false],
    ['let a: boolean | null; x = a ?? true', 'distinguishing', true],
    ['x = a ?? 0', 'distinguishing', true],
    ["x = a ?? ''", 'distinguishing', false],
    ['x = a ?? false', 'distinguishing', false],
    ['x = a ?? 0n', 'distinguishing', false],
    ["x = a ?? 'x'", 'distinguishing', true],
    ['x = a ?? b', 'distinguishing', false],
    ['x = a ?? {}', 'distinguishing', false],
    ['x = a ?? b', 'always', true],
    ['x = a ?? null', 'always', true],
    ['x = a ?? {}', 'always', false],
    ['x = a ?? []', 'always', false],
    ['x = a ?? (() => 1)', 'always', false],
    ['let a: object | null; x = a ?? 1', 'always', false],
    ['let a: null; x = a ?? 1', 'distinguishing', false],
  ])('answers %s in %s mode with %s', (source, mode, expected) => {
    let { context, find } = createTestContext(source)

    expect(
      distinguishesNullishSwap(find('LogicalExpression'), context.hints, mode),
    ).toBe(expected)
  })

  it('reads the operands of a logical assignment', () => {
    let { context, find } = createTestContext(
      "let a: string | undefined; a ||= 'x'",
    )

    expect(
      distinguishesNullishSwap(
        find('AssignmentExpression'),
        context.hints,
        'distinguishing',
      ),
    ).toBe(true)
  })
})
