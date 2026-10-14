import { describe, expect, it } from 'vitest'

import type {
  NullishOptions,
  NullishPlan,
} from '../../../../core/mutators/shared/get-nullish-plan'

import { getNullishPlan } from '../../../../core/mutators/shared/get-nullish-plan'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Options of logical-operator in `recommended`.
 */
const RECOMMENDED: NullishOptions = {
  nullishSwap: 'distinguishing',
  nullishNormalization: false,
}

/**
 * Options of logical-operator in `strict`.
 */
const STRICT: NullishOptions = {
  nullishNormalization: true,
  nullishSwap: 'always',
}

/**
 * Names the mutants a plan emits, in emission order.
 *
 * @param plan - Plan of a `??` group.
 * @returns `left`, `right` and `swap` for the drop of the left side, the drop
 *   of the right side and the swap to `||`.
 */
function listPlannedMutants(plan: NullishPlan): string[] {
  return [
    ...(plan.dropLeft ? ['left'] : []),
    ...(plan.dropRight ? ['right'] : []),
    ...(plan.swap ? ['swap'] : []),
  ]
}

describe('getNullishPlan', () => {
  it.each<{
    options: NullishOptions
    expected: string[]
    source: string
    group: string
  }>([
    {
      source: 'function f(count: number | null) { x = count ?? 0 }',
      expected: ['left', 'right'],
      options: RECOMMENDED,
      group: 'count ?? 0',
    },
    {
      source: 'function f(count: number | null) { x = count ?? 0 }',
      expected: ['right', 'swap'],
      group: 'count ?? 0',
      options: STRICT,
    },
    {
      expected: ['right', 'swap'],
      source: 'x = value ?? 0',
      options: RECOMMENDED,
      group: 'value ?? 0',
    },
    {
      source: 'function f(x: string | undefined) { y = x ?? null }',
      options: RECOMMENDED,
      group: 'x ?? null',
      expected: ['swap'],
    },
    {
      source: 'function f(x: string | undefined) { y = x ?? null }',
      expected: ['right', 'swap'],
      group: 'x ?? null',
      options: STRICT,
    },
    {
      source: 'function f(x: string | undefined) { y = x ?? undefined }',
      group: 'x ?? undefined',
      options: RECOMMENDED,
      expected: ['swap'],
    },
    {
      source: 'x = a ?? b ?? c ?? 0',
      expected: ['right', 'swap'],
      group: 'a ?? b ?? c ?? 0',
      options: RECOMMENDED,
    },
    {
      source: 'x = a ?? b ?? c ?? 0',
      group: 'a ?? b ?? c',
      options: RECOMMENDED,
      expected: ['right'],
    },
    {
      source: 'x = a ?? b ?? c ?? 0',
      expected: ['left', 'right'],
      options: RECOMMENDED,
      group: 'a ?? b',
    },
    {
      source: 'x = a ?? (b ?? c)',
      group: 'a ?? (b ?? c)',
      options: RECOMMENDED,
      expected: ['left'],
    },
    {
      source: 'x = null ?? b',
      options: RECOMMENDED,
      expected: ['right'],
      group: 'null ?? b',
    },
    {
      source: 'function f(s: string) { x = s ?? t }',
      options: RECOMMENDED,
      expected: ['swap'],
      group: 's ?? t',
    },
    {
      expected: ['left', 'right'],
      source: 'x = opts ?? {}',
      options: RECOMMENDED,
      group: 'opts ?? {}',
    },
  ])('plans $source', ({ expected, options, source, group }) => {
    let { context, find } = createTestContext(source)
    let plan = getNullishPlan(
      find('LogicalExpression', group),
      context,
      options,
    )

    expect(listPlannedMutants(plan)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    [
      'function f(x: boolean | undefined) { if (x ?? false) {} }',
      'x ?? false',
      [],
    ],
    [
      'function f(x: boolean | undefined) { if (x ?? true) {} }',
      'x ?? true',
      [],
    ],
    [
      'function f(n: number | undefined) { if (n ?? 1) {} }',
      'n ?? 1',
      ['right'],
    ],
    [
      'function f(n: number | undefined) { if (n ?? /a/u) {} }',
      'n ?? /a/u',
      ['right'],
    ],
    ['function f(n: number) { if (n ?? 1) {} }', 'n ?? 1', []],
    [
      'function f(x: boolean | undefined) { if (a && (x ?? NaN)) {} }',
      'x ?? NaN',
      [],
    ],
    [
      'function f(x: boolean | undefined) { if (a && (x ?? void 0)) {} }',
      'x ?? void 0',
      [],
    ],
    ['if (x ?? y) {}', 'x ?? y', ['right', 'swap']],
    ['x = !(y ?? false)', 'y ?? false', []],
  ])('plans %s in a truth position', (source, group, expected) => {
    let { context, find } = createTestContext(source)
    let plan = getNullishPlan(find('LogicalExpression', group), context, STRICT)

    expect(listPlannedMutants(plan)).toEqual(expected)
  })
})
