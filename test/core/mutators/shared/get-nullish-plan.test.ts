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
 * Counts names into a count map `counts`, whose values are at least 1.
 */
const COUNTS = [
  'let counts = new Map<string, number>()',
  'for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
].join('\n')

/**
 * Reads a flag with a falsy default into a name that is only read for its
 * truth.
 */
const QUIET = [
  'function f(options: { quiet?: boolean }) {',
  '  let quiet = options.quiet ?? false',
  '  if (!quiet) run()',
  '  return quiet ? 1 : 2',
  '}',
].join('\n')

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
    {
      source: 'function f(d?: Date) { x = d?.toISOString() ?? null }',
      group: 'd?.toISOString() ?? null',
      options: RECOMMENDED,
      expected: ['left'],
    },
    {
      source: 'function f(d?: Date) { x = d?.toISOString() ?? null }',
      group: 'd?.toISOString() ?? null',
      expected: ['left', 'right'],
      options: STRICT,
    },
    {
      source: `${COUNTS}\nx = counts.get(name) ?? 0`,
      group: 'counts.get(name) ?? 0',
      expected: ['left', 'right'],
      options: RECOMMENDED,
    },
    {
      source: `${COUNTS}\nx = counts.get(name) ?? 0`,
      group: 'counts.get(name) ?? 0',
      expected: ['left', 'right'],
      options: STRICT,
    },
    {
      source: 'function f(s: string) { x = s.length ?? 0 }',
      group: 's.length ?? 0',
      options: RECOMMENDED,
      expected: ['left'],
    },
    {
      source: 'function f(s: string) { x = s.length ?? 0 }',
      group: 's.length ?? 0',
      expected: ['swap'],
      options: STRICT,
    },
    {
      group: 'options.quiet ?? false',
      options: RECOMMENDED,
      expected: ['left'],
      source: QUIET,
    },
    {
      group: 'options.quiet ?? false',
      expected: ['left'],
      options: STRICT,
      source: QUIET,
    },
    {
      source: 'function f(o) { let on = o.on ?? false; return on }',
      expected: ['right', 'swap'],
      group: 'o.on ?? false',
      options: STRICT,
    },
    {
      source: 'function f(o) { const on = o.on ?? void 0; if (on) run() }',
      group: 'o.on ?? void 0',
      expected: ['left'],
      options: STRICT,
    },
    {
      source: 'function f(o) { const on = o.on ?? -0; if (on) run() }',
      group: 'o.on ?? -0',
      expected: ['left'],
      options: STRICT,
    },
    {
      source: 'function f(o) { const on = o.on ?? void note(); if (on) run() }',
      group: 'o.on ?? void note()',
      expected: ['right', 'swap'],
      options: STRICT,
    },
    {
      source: 'function f(o) { const on = o.on ?? undefined; if (on) run() }',
      expected: ['right', 'swap'],
      group: 'o.on ?? undefined',
      options: STRICT,
    },
    {
      source: 'function f(o) { const on = o.on ?? NaN; if (on) run() }',
      expected: ['right', 'swap'],
      group: 'o.on ?? NaN',
      options: STRICT,
    },
    {
      source:
        'function f(o) { const on = o.on ?? false; store.find(() => on) }',
      expected: ['right', 'swap'],
      group: 'o.on ?? false',
      options: STRICT,
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

  it.each<{
    expected: [string, string][]
    options: NullishOptions
    source: string
    group: string
  }>([
    {
      expected: [
        ['false', 'O15'],
        ['x || false', 'falsy-default'],
        ['x', 'falsy-default'],
      ],
      source: 'function f(x: boolean | undefined) { if (x ?? false) {} }',
      group: 'x ?? false',
      options: STRICT,
    },
    {
      expected: [
        ['true', 'O15'],
        ['x || true', 'O15'],
        ['x', 'O15'],
      ],
      source: 'function f(x: boolean | undefined) { if (x ?? true) {} }',
      group: 'x ?? true',
      options: STRICT,
    },
    {
      expected: [
        ['1', 'O15'],
        ['n || 1', 'O15'],
        ['n', 'never-nullish'],
      ],
      source: 'function f(n: number) { if (n ?? 1) {} }',
      options: STRICT,
      group: 'n ?? 1',
    },
    {
      source: 'function f(count: number | null) { x = count ?? 0 }',
      expected: [['count || 0', 'nullish-swap']],
      options: RECOMMENDED,
      group: 'count ?? 0',
    },
    {
      source: 'function f(name: string | null) { x = name ?? "a" }',
      expected: [['"a"', 'swap-subsumes-drop']],
      group: 'name ?? "a"',
      options: RECOMMENDED,
    },
    {
      expected: [
        ['x || 1', 'nullish-swap'],
        ['1', 'typed-constant'],
      ],
      source: 'function f(x: null) { y = x ?? 1 }',
      options: RECOMMENDED,
      group: 'x ?? 1',
    },
    {
      expected: [
        ['x || 1', 'nullish-swap'],
        ['x', 'never-nullish'],
      ],
      source: 'function f(x: object) { y = x ?? 1 }',
      options: RECOMMENDED,
      group: 'x ?? 1',
    },
    {
      expected: [
        ['y || null', 'nullish-swap'],
        ['y', 'nullish-normalization'],
      ],
      source: 'x = y ?? null',
      options: RECOMMENDED,
      group: 'y ?? null',
    },
    {
      expected: [['(a ?? b) || c', 'nullish-swap']],
      source: 'x = a ?? b ?? c',
      options: RECOMMENDED,
      group: 'a ?? b ?? c',
    },
    {
      expected: [
        ['d?.toISOString() || null', 'never-falsy'],
        ['d?.toISOString()', 'nullish-normalization'],
      ],
      source: 'function f(d?: Date) { x = d?.toISOString() ?? null }',
      group: 'd?.toISOString() ?? null',
      options: RECOMMENDED,
    },
    {
      source:
        "function f(hue: string) { x = /[a-z]+$/u.exec(hue)?.[0] ?? 'deg' }",
      expected: [["/[a-z]+$/u.exec(hue)?.[0] || 'deg'", 'never-falsy']],
      group: "/[a-z]+$/u.exec(hue)?.[0] ?? 'deg'",
      options: STRICT,
    },
    {
      expected: [['counts.get(name) || 0', 'never-falsy']],
      source: `${COUNTS}\nx = counts.get(name) ?? 0`,
      group: 'counts.get(name) ?? 0',
      options: STRICT,
    },
    {
      expected: [
        ['options.quiet || false', 'falsy-default'],
        ['options.quiet', 'falsy-default'],
      ],
      group: 'options.quiet ?? false',
      options: RECOMMENDED,
      source: QUIET,
    },
    {
      expected: [
        ['o.on || null', 'falsy-default'],
        ['o.on', 'nullish-normalization'],
      ],
      source: 'function f(o) { const on = o.on ?? null; if (on) run() }',
      group: 'o.on ?? null',
      options: RECOMMENDED,
    },
    {
      expected: [
        ['o.on || null', 'falsy-default'],
        ['o.on', 'falsy-default'],
      ],
      source: 'function f(o) { const on = o.on ?? null; if (on) run() }',
      group: 'o.on ?? null',
      options: STRICT,
    },
    {
      expected: [
        ['s.length || 0', 'falsy-default'],
        ['s.length', 'never-nullish'],
      ],
      source: 'function f(s: string) { let n = s.length ?? 0; if (n) run() }',
      group: 's.length ?? 0',
      options: STRICT,
    },
  ])(
    'names the rule of each skipped mutant of $source',
    ({ expected, options, source, group }) => {
      let { context, find } = createTestContext(source)
      let { skipped } = getNullishPlan(
        find('LogicalExpression', group),
        context,
        options,
      )

      expect(
        skipped.map(replacement => [replacement.text, replacement.skip!.rule]),
      ).toEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string; group: string }>([
    {
      expected: [
        'the left side is never falsy when defined (it is a number of at least 1, since every value stored in `counts` is at least 1), so || and ?? agree',
      ],
      source: `${COUNTS}\nx = counts.get(name) ?? 0`,
      group: 'counts.get(name) ?? 0',
    },
    {
      expected: [
        '`quiet` is only read for its truth and the default is falsy, so ?? and || agree',
        '`quiet` is only read for its truth and the default is falsy, so dropping it changes nothing',
      ],
      group: 'options.quiet ?? false',
      source: QUIET,
    },
    {
      expected: [
        '`quiet` is only read for its truth and the default is falsy, so ?? and || agree',
        '`quiet` is only read for its truth and the default is falsy, so dropping it changes nothing',
      ],
      source:
        'function f(o) { const quiet: boolean = (o.quiet ?? 0) as boolean; if (quiet) run() }',
      group: 'o.quiet ?? 0',
    },
  ])('explains the skips of $source', ({ expected, source, group }) => {
    let { context, find } = createTestContext(source)
    let { skipped } = getNullishPlan(
      find('LogicalExpression', group),
      context,
      STRICT,
    )

    expect(skipped.map(replacement => replacement.skip!.reason)).toEqual(
      expected,
    )
  })
})
