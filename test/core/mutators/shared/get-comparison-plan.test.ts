import { describe, expect, it } from 'vitest'

import type { TestContextSetup } from '../../../helpers/create-test-context'

import { getComparisonPlan } from '../../../../core/mutators/shared/get-comparison-plan'
import { createTestContext } from '../../../helpers/create-test-context'

/**
 * Parameters with the types of the catalog's examples.
 */
const PARAMETERS = [
  'a: number',
  'b: number',
  'mode: string',
  'value: string',
  'list: string[]',
  'user: User',
  'start: Date',
  'end: Date',
  's: string',
].join(', ')

/**
 * Builds the texts comparison-operator would emit for a comparison.
 *
 * @param body - Body of a function with typed parameters.
 * @param comparison - Text of the comparison.
 * @param setup - File name and settings of the run.
 * @returns The replacement texts in emission order.
 */
function planOf(
  body: string,
  comparison: string,
  setup: TestContextSetup = {},
): string[] {
  let { context, find } = createTestContext(
    `interface User {} function f(${PARAMETERS}) { ${body} }`,
    setup,
  )
  return getComparisonPlan(
    find('BinaryExpression', comparison),
    context,
  ).entries.map(entry => entry.text)
}

describe('getComparisonPlan', () => {
  it.each<[string, string, string[]]>([
    ['x = a < b', 'a < b', ['a <= b', 'a != b', 'false']],
    ['x = a <= b', 'a <= b', ['a < b', 'a == b', 'true']],
    ['x = a > b', 'a > b', ['a >= b', 'a != b', 'false']],
    ['x = a >= 10', 'a >= 10', ['a > 10', 'a == 10', 'a >= 9']],
    ['x = 10 > a', '10 > a', ['10 >= a', '10 != a', '9 > a']],
    ['x = a <= -1', 'a <= -1', ['a < -1', 'a == -1', 'a <= 0']],
    ['x = 2n >= a', '2n >= a', ['2n > a', '2n == a', '3n >= a']],
    ['x = a < (5)', 'a < (5)', ['a <= (5)', 'a != (5)', 'a < (4)']],
    ['x = a === b', 'a === b', ['a <= b', 'a >= b', 'false']],
    ['x = a != b', 'a != b', ['a < b', 'a > b', 'true']],
    ["x = mode === 'dark'", "mode === 'dark'", ['true', 'false']],
    ['x = key in map', 'key in map', ['true', 'false']],
    ['x = user instanceof Map', 'user instanceof Map', ['true', 'false']],
    ['x = a < 1e300', 'a < 1e300', ['a <= 1e300', 'a != 1e300', 'false']],
    ['x = 1 < 2', '1 < 2', ['1 <= 2', '1 != 2', 'false']],
  ])('plans %s', (body, comparison, expected) => {
    expect(planOf(body, comparison)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    [
      'x = list.length > 0',
      'list.length > 0',
      ['list.length >= 0', 'list.length > 1'],
    ],
    [
      'x = 0 < list.length',
      '0 < list.length',
      ['0 <= list.length', '1 < list.length'],
    ],
    [
      'x = list.indexOf(s) > -1',
      'list.indexOf(s) > -1',
      ['list.indexOf(s) >= -1', 'list.indexOf(s) > 0'],
    ],
    [
      'x = list.indexOf(s) !== -1',
      'list.indexOf(s) !== -1',
      ['list.indexOf(s) < -1', 'true'],
    ],
    [
      "const at = s.indexOf(':'); if (at === -1) {}",
      'at === -1',
      ['at >= -1', 'false'],
    ],
    ['x = list.length < -1', 'list.length < -1', ['list.length != -1']],
    [
      'x = list.length >= 0n',
      'list.length >= 0n',
      ['list.length > 0n', 'list.length == 0n'],
    ],
    ['let n = 3; while (n > 0) { n--; use(n) }', 'n > 0', ['n >= 0', 'n > 1']],
    ['let n = 3; while (0 < n) { n--; use(n) }', '0 < n', ['0 <= n', '1 < n']],
    [
      'let n = 3; while (a > b && n > 0) { n--; use(n) }',
      'n > 0',
      ['n >= 0', 'n > 1'],
    ],
    [
      'let n = 3; while (n >= 1) { n -= 1; use(n) }',
      'n >= 1',
      ['n > 1', 'n == 1', 'n >= 0'],
    ],
  ])('skips impossible regions in %s', (body, comparison, expected) => {
    expect(planOf(body, comparison)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    [
      'x = list.length === 0n',
      'list.length === 0n',
      ['list.length <= 0n', 'list.length >= 0n', 'false'],
    ],
    [
      'x = 0n !== list.length',
      '0n !== list.length',
      ['0n < list.length', '0n > list.length', 'true'],
    ],
    [
      'let n = 0 as number | bigint; for (let c of s) n++; x = n === 0n',
      'n === 0n',
      ['n <= 0n', 'n >= 0n', 'false'],
    ],
    [
      'x = list.length == 0n',
      'list.length == 0n',
      ['list.length >= 0n', 'false'],
    ],
  ])(
    'reads a bound against a BigInt literal only in a loose comparison: %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison)).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    [
      'x = n > 9007199254740993n',
      'n > 9007199254740993n',
      [
        'n >= 9007199254740993n',
        'n != 9007199254740993n',
        'n > 9007199254740994n',
      ],
    ],
    [
      'x = 9007199254740993n >= n',
      '9007199254740993n >= n',
      [
        '9007199254740993n > n',
        '9007199254740993n == n',
        '9007199254740994n >= n',
      ],
    ],
    [
      'x = n == 9007199254740993n',
      'n == 9007199254740993n',
      ['n <= 9007199254740993n', 'n >= 9007199254740993n', 'false'],
    ],
  ])(
    'reads no bound against a BigInt literal that a number rounds: %s',
    (body, comparison, expected) => {
      expect(
        planOf(
          `let n = 9007199254740992; for (let c of s) n += 2; ${body}`,
          comparison,
        ),
      ).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    ["x = typeof value === 'string'", "typeof value === 'string'", ['false']],
    ["x = typeof value !== 'number'", "typeof value !== 'number'", ['false']],
    ['x = user === null', 'user === null', ['true']],
    ['x = a > b ? a : b', 'a > b', ['a != b', 'false']],
    ['x = p > q ? p : q', 'p > q', ['p >= q', 'p != q', 'false']],
    ['x = a > q ? a : q', 'a > q', ['a >= q', 'a != q', 'false']],
    ['x = q > s ? s : q', 'q > s', ['q >= s', 'q != s', 'false']],
    ['x = s > value ? s : value', 's > value', ['s != value', 'false']],
    ['x = start > end ? start : end', 'start > end', ['start >= end', 'false']],
    ['x = a > s ? a : s', 'a > s', ['a >= s', 'a != s', 'false']],
    ['x = a <= b ? (b) : a', 'a <= b', ['a == b', 'true']],
    ['x = a.c > b ? a : b', 'a.c > b', ['a.c >= b', 'a.c != b', 'false']],
    ['x = a < -1 ? -1 : a', 'a < -1', ['a != -1', 'a < -2']],
    ['x = a > -1 ? a : -1', 'a > -1', ['a != -1', 'a > 0']],
    ['x = a < -b ? -b : a', 'a < -b', ['a <= -b', 'a != -b', 'false']],
    ['x = f() > b ? f() : b', 'f() > b', ['f() >= b', 'f() != b', 'false']],
    ['x = a === b ? a : b', 'a === b', ['a <= b', 'a >= b', 'false']],
    [
      'x = this.n > 0 ? this.n : 0',
      'this.n > 0',
      ['this.n >= 0', 'this.n != 0', 'this.n > 1'],
    ],
    [
      'x = list[0] > s ? list[0] : s',
      'list[0] > s',
      ['list[0] >= s', 'list[0] != s', 'false'],
    ],
    ['x = c ? (a > b) : b', 'a > b', ['a >= b', 'a != b', 'false']],
  ])('applies the equivalence rules to %s', (body, comparison, expected) => {
    expect(planOf(body, comparison)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    ['if (a > 0 && isActive) {}', 'a > 0', ['a >= 0', 'a != 0', 'a > 1']],
    ['if (isActive || mode === b) {}', 'mode === b', []],
    ["x = mode === 'busy' && y", "mode === 'busy'", ['false']],
    ["x = !(mode === 'busy') && y", "mode === 'busy'", ['true']],
    ["x = mode === 'busy' || y", "mode === 'busy'", ['true']],
    ["x = y && mode === 'busy'", "mode === 'busy'", ['true', 'false']],
    [
      'x = list.length > 0 && y',
      'list.length > 0',
      ['list.length >= 0', 'list.length > 1'],
    ],
  ])(
    'leaves logical-operator its constants in %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison)).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    ['return x === 0 && y > 3 && isOk(z)', 'x === 0', ['x <= 0', 'x >= 0']],
    [
      'return x === 0 && y > 3 && isOk(z)',
      'y > 3',
      ['y >= 3', 'y != 3', 'y > 4'],
    ],
    ['return isOk(z) && x === y', 'x === y', ['true', 'false']],
    ['return z > 1 && x === y && isOk(w)', 'x === y', []],
    ['return z > 1 && (x === y && isOk(w))', 'x === y', []],
    ['return isOk(w) && (x === y && z)', 'x === y', ['false']],
    ['return x !== 0 && isOk(z)', 'x !== 0', ['x < 0', 'x > 0']],
    ['return isOk(z) || !(x === y)', 'x === y', ['true', 'false']],
    ['return x < y || (z > 1)', 'z > 1', ['z >= 1', 'z != 1', 'z > 2']],
    ['return u.a || x === y', 'x === y', ['true', 'false']],
    ['return (u.a || x === y) && c', 'x === y', ['true', 'false']],
    ['return x === y && 1', 'x === y', ['false']],
  ])('applies the group constant rule in %s', (body, comparison, expected) => {
    let { context, find } = createTestContext(`function f(u) { ${body} }`, {
      file: 'example.js',
    })
    let plan = getComparisonPlan(find('BinaryExpression', comparison), context)

    expect(plan.entries.map(entry => entry.text)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    [
      'for (let i = 0; i <= 10; i++) {}',
      'i <= 10',
      ['i < 10', 'i == 10', 'i <= 11'],
    ],
    ['while (a < b) {}', 'a < b', ['a <= b', 'false']],
    ['while (!(a < b)) {}', 'a < b', ['a <= b', 'a != b']],
    ['for (let i = 0; i !== b; i++) {}', 'i !== b', ['i > b']],
    ['for (let i = 10; b !== i; i -= 1) {}', 'b !== i', ['b > i']],
    ['for (let i = 10; i !== b; i -= 2) {}', 'i !== b', ['i < b']],
    ['for (let i = 0; i !== b; i += 2) {}', 'i !== b', ['i > b']],
    ['for (let i = 0; i !== b; i++) { b-- }', 'i !== b', ['i < b', 'i > b']],
    ['for (let i = 0; i !== b; i *= 2) {}', 'i !== b', ['i < b', 'i > b']],
    ['for (let i = 0; i !== b; i += b) {}', 'i !== b', ['i < b', 'i > b']],
    ['for (let i = 0; i !== b; i -= -1) {}', 'i !== b', ['i < b', 'i > b']],
    ['for (let i = 0; i !== b; i++) { i-- }', 'i !== b', ['i < b', 'i > b']],
    ['for (let i = 0; i !== b; i++) { f(() => i--) }', 'i !== b', ['i > b']],
    ['for (let i = 0; f(i) !== b;) {}', 'f(i) !== b', ['f(i) < b', 'f(i) > b']],
    [
      'for (let i = 0; this.i !== b; this.i++) {}',
      'this.i !== b',
      ['this.i > b'],
    ],
    [
      'for (let i = 0; i?.x !== b; i++) {}',
      'i?.x !== b',
      ['i?.x < b', 'i?.x > b'],
    ],
    ['for (let i = 0; i?.x !== b; i.x++) {}', 'i?.x !== b', ['i?.x > b']],
    [
      'while (this.i !== b) { this.n++; step() }',
      'this.i !== b',
      ['this.i < b', 'this.i > b'],
    ],
    [
      'while (this.i !== b) { this.n++; this.i-- }',
      'this.i !== b',
      ['this.i < b'],
    ],
    [
      'while (a.x !== b) { a.x++; a[k]++ }',
      'a.x !== b',
      ['a.x < b', 'a.x > b'],
    ],
    ['while (a.x !== b) { a.x++; c[k]++ }', 'a.x !== b', ['a.x > b']],
    ['for (; a !== b;) {}', 'a !== b', ['a < b', 'a > b']],
    ["while (mode !== 'x') {}", "mode !== 'x'", ['false']],
    ['for (;;) { if (++a > b) break }', '++a > b', ['++a >= b', '++a != b']],
    ['for (;;) { if (a >= b) break; a++ }', 'a >= b', ['a > b']],
    ['for (;;) { step(); if (a === b) break; a++ }', 'a === b', ['a <= b']],
    ['for (;;) { step(); if (a === b) break; a-- }', 'a === b', ['a >= b']],
    [
      'for (;;) { step(); if (a === b) break }',
      'a === b',
      ['a <= b', 'a >= b'],
    ],
    ['for (;;) { step(); if (b === a) break; a++ }', 'b === a', ['b >= a']],
    [
      'for (;;) { a = 0; while (true) { if (a === b) return; a++ } }',
      'a === b',
      ['a <= b'],
    ],
  ])('skips timeout-only entries in %s', (body, comparison, expected) => {
    expect(planOf(body, comparison)).toEqual(expected)
  })

  it.each<[string, string, string[]]>([
    ['while (a < b) {}', 'a < b', ['a <= b', 'a != b', 'false']],
    ['for (let i = 0; i !== b; i++) {}', 'i !== b', ['i < b', 'i > b', 'true']],
    [
      'while (list.length > 0) list.pop()',
      'list.length > 0',
      ['list.length >= 0', 'list.length > 1'],
    ],
  ])(
    'keeps timeout-only entries with timeouts in %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison, { timeouts: true })).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    [
      'while (list.length > 0) list.pop()',
      'list.length > 0',
      ['list.length > 1'],
    ],
    [
      'do { list.pop() } while (list.length >= 1)',
      'list.length >= 1',
      ['list.length > 1', 'list.length == 1'],
    ],
    [
      'for (;;) { list.pop(); if (list.length <= 0) break }',
      'list.length <= 0',
      ['list.length <= 1'],
    ],
    [
      "while (s.indexOf('x') > -1) s = s.slice(1)",
      "s.indexOf('x') > -1",
      ["s.indexOf('x') > 0"],
    ],
    [
      'while (true) { if (list.length === 0) break; list.pop() }',
      'list.length === 0',
      [],
    ],
  ])(
    'skips the entries that a lower bound leaves at a loop constant in %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison)).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    [
      'x = list.filter(item => item.id !== id)',
      'item.id !== id',
      ['true', 'false'],
    ],
    [
      'x = list.filter(item => item.n >= b)',
      'item.n >= b',
      ['item.n > b', 'item.n == b', 'true'],
    ],
    [
      'x = list.filter(item => item.tags.length > 0)',
      'item.tags.length > 0',
      ['item.tags.length >= 0', 'item.tags.length > 1'],
    ],
    [
      'x = list.filter(item => item.tags.length >= 1)',
      'item.tags.length >= 1',
      [
        'item.tags.length > 1',
        'item.tags.length == 1',
        'item.tags.length >= 0',
      ],
    ],
    [
      'x = list.toSorted((p, q) => p.n < q.n)',
      'p.n < q.n',
      ['p.n <= q.n', 'p.n != q.n', 'false'],
    ],
  ])(
    'keeps the constants of callbacks that return a new array in %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison)).toEqual(expected)
    },
  )

  it.each<[string, string, string[]]>([
    [
      'x = list.sort((p, q) => p.n < q.n)',
      'p.n < q.n',
      ['p.n <= q.n', 'p.n != q.n'],
    ],
  ])(
    'leaves no-op callbacks to method-call in %s',
    (body, comparison, expected) => {
      expect(planOf(body, comparison)).toEqual(expected)
    },
  )

  it('plans a private name check', () => {
    let { context, find } = createTestContext(
      'class A { #x; m(o) { return #x in o } }',
    )
    let plan = getComparisonPlan(find('BinaryExpression'), context)

    expect(plan.entries.map(entry => entry.text)).toEqual(['true', 'false'])
  })

  it('describes each entry', () => {
    let { context, find } = createTestContext(
      'function f(a: number) { return a >= 10 }',
    )

    expect(
      getComparisonPlan(find('BinaryExpression'), context).entries,
    ).toEqual([
      { text: 'a > 10', region: 'eq', kind: 'swap', value: false },
      { text: 'a == 10', region: 'gt', kind: 'swap', value: false },
      { text: 'a >= 9', kind: 'shift', region: 'lt', value: true },
    ])
  })

  it.each<{
    comparison: string
    expected: string[]
    body: string
    file: string
  }>([
    {
      expected: ['a < b <= c', 'a < b != c', 'false'],
      comparison: 'a < b < c',
      body: 'x = a < b < c',
      file: 'example.js',
    },
    {
      expected: ['true', 'false'],
      comparison: 'q === a < b',
      body: 'x = q === a < b',
      file: 'example.js',
    },
    {
      expected: ['(a < b) > (c)', 'a < b == (c)', 'true'],
      comparison: 'a < b >= (c)',
      body: 'x = a < b >= (c)',
      file: 'example.ts',
    },
    {
      expected: ['(a <= b) >= c', '(a <= b) != c', 'false'],
      comparison: '(a <= b) > c',
      body: 'x = (a <= b) > c',
      file: 'example.js',
    },
  ])(
    'keeps inner grouping in $body',
    ({ comparison, expected, body, file }) => {
      let { context, find } = createTestContext(body, { file })
      let plan = getComparisonPlan(
        find('BinaryExpression', comparison),
        context,
      )

      expect(plan.entries.map(entry => entry.text)).toEqual(expected)
    },
  )

  it.each<[string, string, [string, string, string | null][]]>([
    [
      'x = list.length > 0',
      'list.length > 0',
      [['list.length != 0', 'lower-bound', null]],
    ],
    [
      'x = list.length < -1',
      'list.length < -1',
      [
        ['list.length <= -1', 'lower-bound', null],
        ['list.length < -2', 'lower-bound', null],
      ],
    ],
    [
      "x = typeof value === 'string'",
      "typeof value === 'string'",
      [['true', 'proven-comparison', null]],
    ],
    [
      'x = user === null',
      'user === null',
      [['false', 'proven-comparison', null]],
    ],
    ['x = a > b ? a : b', 'a > b', [['a >= b', 'min-max-idiom', null]]],
    [
      'x = start < end',
      'start < end',
      [['start != end', 'reference-equality', null]],
    ],
    [
      'x = start <= end',
      'start <= end',
      [['start == end', 'reference-equality', null]],
    ],
    ['if (a > b && c) {}', 'a > b', [['false', 'O3', 'logical-operator']]],
    ['x = mode === s && c', 'mode === s', [['true', 'O3', 'logical-operator']]],
    ['while (a < b) {}', 'a < b', [['a != b', 'loop-running', null]]],
    [
      'for (let i = 0; i !== b; i++) {}',
      'i !== b',
      [
        ['i < b', 'one-way-counter', null],
        ['true', 'loop-running', null],
      ],
    ],
    [
      'for (;;) { if (a >= b) break; a++ }',
      'a >= b',
      [
        ['a == b', 'loop-running', null],
        ['true', 'O13', null],
      ],
    ],
    [
      'x = list.sort((p, q) => p.n > q.n)',
      'p.n > q.n',
      [['false', 'O12', null]],
    ],
    [
      'while (list.length > 0) list.pop()',
      'list.length > 0',
      [
        ['list.length >= 0', 'loop-running', null],
        ['list.length != 0', 'lower-bound', null],
      ],
    ],
    [
      'while (a > b && list.length > 0) list.pop()',
      'list.length > 0',
      [
        ['list.length >= 0', 'O3', 'logical-operator'],
        ['list.length != 0', 'lower-bound', null],
      ],
    ],
    [
      'while (a > b && list.length >= 1) list.pop()',
      'list.length >= 1',
      [['list.length >= 0', 'O3', 'logical-operator']],
    ],
    [
      'let row = 0; for (let item of list) { x = row === 0; row++ }',
      'row === 0',
      [['row <= 0', 'lower-bound', null]],
    ],
    [
      'let n = 3; while (n > 0) { n--; use(n) }',
      'n > 0',
      [['n != 0', 'lower-bound', null]],
    ],
    [
      'let n = 3; while (a > b && n > 0) { n--; use(n) }',
      'n > 0',
      [['n != 0', 'lower-bound', null]],
    ],
    ['let n = 3; while (n >= 1) { n -= 1; use(n) }', 'n >= 1', []],
  ])(
    'names the rule of each skipped entry of %s',
    (body, comparison, expected) => {
      let { context, find } = createTestContext(
        `interface User {} function f(${PARAMETERS}) { ${body} }`,
      )
      let { skipped } = getComparisonPlan(
        find('BinaryExpression', comparison),
        context,
      )

      expect(
        skipped.map(replacement => [
          replacement.text,
          replacement.skip!.rule,
          replacement.skip!.by?.mutator ?? null,
        ]),
      ).toEqual(expected)
    },
  )

  it('words the skip of an entry that the lower bound leaves constant and marks it a heuristic', () => {
    let { context, find } = createTestContext(
      'function f(list: string[]) { while (list.length > 0) list.pop() }',
    )
    let { skipped } = getComparisonPlan(find('BinaryExpression'), context)

    expect(skipped[0]!.skip!.reason).toBe(
      'a lower bound of an operand makes it the constant true (a length is never negative), and true keeps the loop running forever, so only a timeout could kill it',
    )
    expect(skipped[0]!.skip).toMatchObject({
      rule: 'loop-running',
      heuristic: true,
    })
  })

  it('skips an entry that the bound of a counter leaves constant in a comparison that is not its guard', () => {
    let { context, find } = createTestContext(
      'function f() { let n = 3; if (n > 0) n--; while (n > 0) use(n) }',
    )
    let { skipped } = getComparisonPlan(
      find('BinaryExpression', 'n > 0', 1),
      context,
    )

    expect(
      skipped.map(replacement => [replacement.text, replacement.skip!.reason]),
    ).toStrictEqual([
      [
        'n >= 0',
        'a lower bound of an operand makes it the constant true (`n` starts at 3 and goes down only right after `n > 0`), and true keeps the loop running forever, so only a timeout could kill it',
      ],
      [
        'n != 0',
        'a lower bound of an operand makes the inputs where it differs impossible (`n` starts at 3 and goes down only right after `n > 0`)',
      ],
    ])
  })

  it('gives an entry that the lower bound leaves at an owned loop constant the skip of the owner', () => {
    let { context, find } = createTestContext(
      'function f(list: string[], ready: boolean) { while (ready && list.length > 0) list.pop() }',
    )
    let { skippedConstants, skipped } = getComparisonPlan(
      find('BinaryExpression'),
      context,
    )

    expect(skipped[0]!.skip).toStrictEqual({
      reason:
        'a lower bound of an operand makes it the constant true (a length is never negative), and logical-operator owns the truth value of a boolean-mode operand',
      by: { node: find('LogicalExpression'), mutator: 'logical-operator' },
      heuristic: true,
      rule: 'O3',
    })
    expect(skippedConstants.get(true)).toBe(skipped[0]!.skip)
  })

  it.each([
    {
      reason:
        'a lower bound of an operand makes the inputs where it differs impossible (`row` starts at 0 and only grows)',
      source:
        'function f(list: string[]) { let row = 0; for (let item of list) { use(row > 0); row++ } }',
    },
    {
      reason:
        'a lower bound of an operand makes the inputs where it differs impossible (`seen` is a Set, whose size is never negative)',
      source:
        'function f(list: string[]) { let seen = new Set(list); return seen.size > 0 }',
    },
  ])('names why the bound holds in $source', ({ reason, source }) => {
    let { context, find } = createTestContext(source)
    let { skipped } = getComparisonPlan(find('BinaryExpression'), context)

    expect(skipped.map(replacement => replacement.skip!.reason)).toStrictEqual([
      reason,
    ])
  })

  it('names why the bound rules out every input where a constant differs', () => {
    let { context, find } = createTestContext(
      'function f(list: string[]) { return list.length <= -1 }',
    )
    let { skippedConstants } = getComparisonPlan(
      find('BinaryExpression'),
      context,
    )

    expect(skippedConstants.get(false)).toStrictEqual({
      reason:
        'a lower bound of an operand makes every input where the comparison is not false impossible (a length is never negative)',
      rule: 'lower-bound',
    })
  })
})
