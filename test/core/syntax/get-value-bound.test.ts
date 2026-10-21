import type { ArrayExpression } from 'oxc-parser'

import { describe, expect, it, vi } from 'vitest'

import type { ValueBound } from '../../../types/syntax/value-bound'

import { getFixedInitializer } from '../../../core/syntax/get-fixed-initializer'
import { solveValueBounds } from '../../../core/syntax/solve-value-bounds'
import { getValueBound } from '../../../core/syntax/get-value-bound'
import { createTestFile } from '../../helpers/create-test-file'
import { findProbe } from '../../helpers/find-probe'

vi.mock(
  import('../../../core/syntax/get-fixed-initializer'),
  async importOriginal => {
    let actual = await importOriginal()
    return { getFixedInitializer: vi.fn(actual.getFixedInitializer) }
  },
)

/**
 * How a test bounds the argument of the last `f(...)` of a snippet.
 */
interface BoundSetup {
  /**
   * Whether the snippet is the script of a component, whose top level other
   * code shares; false when omitted.
   */
  component?: boolean

  /**
   * Whether the argument is a start or written value, where number literals
   * count; false when omitted.
   */
  written?: boolean
}

/**
 * Bounds the argument of the last `f(...)` of a snippet against the bounds of
 * its program.
 *
 * @param source - Snippet that calls `f`.
 * @param setup - Whether the argument is a written value and the snippet a
 *   component script.
 * @returns The bound, or null.
 */
function boundOf(source: string, setup: BoundSetup = {}): ValueBound | null {
  let file = createTestFile(source)
  let bounds = solveValueBounds(
    file.tree,
    file.scopes,
    new Set(setup.component ? [file.parsed.program] : []),
  )
  return getValueBound(bounds, findProbe(file), setup.written)
}

/**
 * Builds a balanced sum of the `size` members of names, so a sum of many stays
 * within the depth limit.
 *
 * @param names - Names of collections, at least one.
 * @returns The sum, in parentheses when it has two parts or more.
 */
function sumSizes(names: string[]): string {
  if (names.length === 1) {
    return `${names[0]}.size`
  }
  let half = Math.ceil(names.length / 2)
  return `(${sumSizes(names.slice(0, half))} + ${sumSizes(names.slice(half))})`
}

/**
 * Builds the bound of an integer that is never nullish.
 *
 * @param lower - Smallest number.
 * @param because - Reason of the bound.
 * @returns The bound.
 */
function integer(lower: number, because: string): ValueBound {
  return { nullable: false, integer: true, because, lower }
}

/**
 * Counts names into a count map `counts`, whose values are at least 1.
 */
const COUNTS = [
  'let counts = new Map<string, number>()',
  'for (let name of names) counts.set(name, (counts.get(name) ?? 0) + 1)',
].join('\n')

describe('getValueBound', () => {
  it.each([
    {
      expected: integer(0, 'a length is never negative'),
      source: 'f(s.length)',
    },
    {
      expected: integer(0, 'a length is never negative'),
      source: 'f((s.length as number))',
    },
    {
      expected: integer(-1, '`indexOf` returns -1 or an index'),
      source: 'f(s.indexOf(x))',
    },
    {
      expected: integer(-1, '`findLastIndex` returns -1 or an index'),
      source: 'f(list.findLastIndex(g))',
    },
    {
      expected: integer(0, 'the size of a Set is never negative'),
      source: 'f(new Set(s).size)',
    },
    {
      expected: integer(0, '`seen` is a Map, whose size is never negative'),
      source: 'const seen = new Map(); f(seen.size)',
    },
    {
      expected: integer(1, 'a length is never negative'),
      source: 'f(s.length + 1)',
    },
    {
      expected: integer(
        1,
        '`m` keeps its initial value; a length is never negative',
      ),
      source: 'const n = s.length; const m = n + 1; f(m)',
    },
    {
      expected: integer(-1, '`indexOf` returns -1 or an index'),
      source: 'f(ok ? s.indexOf(x) : -1)',
    },
    {
      expected: integer(
        -1,
        'a length is never negative; `indexOf` returns -1 or an index',
      ),
      source: 'f(ok ? s.length : t.indexOf(x))',
    },
    {
      expected: integer(0, 'a length is never negative'),
      source: 'f(s.length ?? -5)',
    },
    {
      expected: integer(0, '`row` starts at 0 and only grows'),
      source: 'let row = 0; row++; f(row)',
    },
    {
      expected: integer(
        0,
        '`row` starts at 0 and only grows; a length is never negative',
      ),
      source: 'let row = 0; row++; f(row + s.length)',
    },
    {
      expected: integer(1, 'every value stored in `counts` is at least 1'),
      source: `${COUNTS}\nfor (let [name, count] of counts) f(count)`,
    },
    {
      expected: integer(0, 'every value stored in `counts` is at least 1'),
      source: `${COUNTS}\nf(counts.get(k) ?? 0)`,
    },
  ])('bounds $source', ({ expected, source }) => {
    expect(boundOf(source)).toStrictEqual(expected)
  })

  it.each([
    { source: 'f(s?.length)', lower: 0 },
    { source: 'f(a?.b.length)', lower: 0 },
    { source: 'f(s?.indexOf(x))', lower: -1 },
    { source: 'f(s.indexOf?.(x))', lower: -1 },
    { source: `${COUNTS}\nf(counts.get(k))`, lower: 1 },
  ])('bounds $source and lets it be nullish', ({ source, lower }) => {
    expect(boundOf(source)).toMatchObject({ nullable: true, lower })
  })

  it('tracks whether a value is an integer', () => {
    expect(boundOf('f(s.length + 0.5)')).toMatchObject({
      integer: false,
      lower: 0.5,
    })
    expect(boundOf('f(ok ? s.length : 0.5)')).toMatchObject({
      integer: false,
      lower: 0,
    })
  })

  it.each([
    'f(1)',
    'f(-1)',
    'f(ok ? 1 : 2)',
    'f(1 + 2)',
    'const LIMIT = 5; f(LIMIT)',
    'let limit = 5; f(limit)',
    'const n = 1 + 2; f(n)',
    'f(s.size)',
    'f(s.byteLength)',
    'f(s[length])',
    'f(s.count)',
    'f(s.length - 1)',
    'f(s.length * 2)',
    'f(-s.length)',
    'f(+s.length)',
    'f(s.length || 1)',
    'f(a && s.length)',
    'f(x)',
    'f(this)',
    'f([1])',
    'f(Math.abs(x))',
    'f(s.includes(x))',
    'f(indexOf(x))',
    'f(s[indexOf](x))',
    'function g(count: number) { f(count) }',
    "import { n } from 'x'; f(n)",
    'const a = b; const b = a; f(a)',
    `${COUNTS}\nf(s.length + counts.get(k))`,
    `${COUNTS}\nf(counts.get(k) + 1)`,
    `${COUNTS}\nf(counts.get(k, j))`,
    'f(map.get(k))',
    'f(o.map.get(k))',
    'const m = new Map(); m.set(k, s.length - 1); for (const [, v] of m) f(v)',
    'const map = {}; f(map.get(k))',
    'f(ok ? s.length : x)',
    'f(ok ? x : s.length)',
    'f(x ?? s.length)',
    `${COUNTS}\nf(counts.get(k) ?? undefined)`,
  ])('gives no bound for %s', source => {
    expect(boundOf(source)).toBeNull()
  })

  it.each([
    { source: 'f(1)', lower: 1 },
    { source: 'f(ok ? 1 : -2)', lower: -2 },
    { source: 'f(1 + s.length)', lower: 1 },
  ])('bounds the written value $source', ({ source, lower }) => {
    expect(boundOf(source, { written: true })).toMatchObject({
      nullable: false,
      lower,
    })
  })

  it.each([
    {
      source: [
        'let a = 0',
        'let dec = () => {',
        '  a -= 1',
        '}',
        'dec()',
        'f(a)',
      ].join('\n'),
      title: 'a decrement inside a closure',
    },
    {
      source: [
        'let b = 0',
        'for (let item of items) {',
        "  if (item === '(') b += 1",
        '  else if (b > 0 && foo()) b -= 1',
        '}',
        'f(b)',
      ].join('\n'),
      title: 'a call after the guard',
    },
    {
      source: [
        'let c = 0',
        'for (let item of items) {',
        "  if (item === '(') c += 1",
        '  else if (c > 0) {',
        '    c -= 1',
        '    c -= 1',
        '  }',
        '}',
        'f(c)',
      ].join('\n'),
      title: 'a second decrement',
    },
    { source: 'var d = 0; d++; f(d)', title: 'a var counter' },
    {
      source: [
        'let m = new Map<string, number>()',
        'm.set(key, (m.get(key) ?? 0) + 1)',
        'use(m)',
        'f(m.get(key) ?? 7)',
      ].join('\n'),
      title: 'a map passed to a function',
    },
    {
      source: [
        'let m = new Map<string, number>()',
        'm.set(key, (m.get(key) ?? 0) + 1)',
        'm.forEach((value, k, map) => map.set(k, 0))',
        'f(m.get(key) ?? 7)',
      ].join('\n'),
      title: 'a map changed through forEach',
    },
    { source: 'let g = 0; [g] = [-5]; f(g)', title: 'a destructuring write' },
    {
      source: 'class Map { size = -1 } let m = new Map(); f(m.size)',
      title: 'the size of a local class Map',
    },
    {
      source: [
        'export const hits = new Map<string, number>()',
        'hits.set(key, (hits.get(key) ?? 0) + 1)',
        'for (let [key, count] of hits) f(count)',
      ].join('\n'),
      title: 'an exported count map',
    },
    {
      source: [
        'export const hits = new Map<string, number>()',
        'hits.set(key, (hits.get(key) ?? 0) + 1)',
        'f(hits.get(key) ?? -1)',
      ].join('\n'),
      title: 'the get of an exported count map',
    },
    {
      source: [
        'let depth = 1',
        'let probe = {',
        '  get closing(): boolean {',
        '    if (depth > 0) depth -= 1',
        '    return true',
        '  },',
        '}',
        'if (depth > 0 && probe.closing) depth -= 1',
        'f(depth)',
      ].join('\n'),
      title: 'a getter after the guard',
    },
    {
      source: [
        'let total = 0',
        'total++',
        'namespace S { export let total = -5 }',
        'namespace S { f(total) }',
      ].join('\n'),
      title: 'a counter named like an export of a namespace',
    },
    {
      source: [
        'let count = 0',
        'count++',
        'namespace Inner {',
        '  namespace count {}',
        '  export function reset() { count = -1 }',
        '}',
        'f(count)',
      ].join('\n'),
      title: 'a counter that a namespace body writes past an empty namespace',
    },
  ])('gives no bound through $title', ({ source }) => {
    expect(boundOf(source)).toBeNull()
  })

  it.each([
    {
      source: [
        'let total = 0',
        'total++',
        'declare namespace S { const total: number }',
        'declare namespace S { const total: number }',
        'f(total)',
      ].join('\n'),
      title: 'two ambient bodies of a namespace that declare its name',
    },
    {
      source: [
        'let total = 0',
        'total++',
        'declare global {',
        '  namespace NodeJS {',
        '    interface ProcessEnv { total: string }',
        '  }',
        '}',
        'f(total)',
      ].join('\n'),
      title: 'a namespace of a global augmentation',
    },
  ])('keeps the bound of a counter beside $title', ({ source }) => {
    expect(boundOf(source)).toStrictEqual(
      integer(0, '`total` starts at 0 and only grows'),
    )
  })

  it.each([
    {
      source: 'let e = 0; e += items.length; e = -1; f(e)',
      title: 'a later negative write',
      lower: -1,
    },
    {
      source: 'let m = new Map(); m.set(key, -1); f(m.get(key) ?? 0)',
      title: 'a negative map value',
      lower: -1,
    },
  ])('keeps the low bound of $title', ({ source, lower }) => {
    expect(boundOf(source)).toMatchObject({ nullable: false, lower })
  })

  it('gives no bound past the deepest level it reads', () => {
    let chain = Array.from(
      { length: 3000 },
      (_, index) => `const a${index + 1} = a${index} + 1`,
    )
    let source = ['const a0 = s.length', ...chain].join('\n')

    expect(boundOf(`${source}\nf(a40)`)).toMatchObject({ lower: 40 })
    expect(boundOf(`${source}\nf(a60)`)).toBeNull()
    expect(boundOf(`${source}\nf(a3000)`)).toBeNull()
  })

  it('keeps one clause per fact through names that share their parts', () => {
    let chain = Array.from(
      { length: 15 },
      (_, index) => `const a${index + 2} = a${index + 1} + a${index}`,
    )
    let source = [
      'const a0 = s.length',
      'const a1 = s.indexOf(x) + 2',
      ...chain,
      'f(a16)',
    ].join('\n')
    let bound = boundOf(source)

    expect(bound!.because.length).toBeLessThan(200)
    expect(bound).toStrictEqual(
      integer(
        987,
        '`a16` keeps its initial value; `indexOf` returns -1 or an index; a length is never negative',
      ),
    )
  })

  it('gives every name the bound of a fresh question whatever was asked before', () => {
    let chain = Array.from(
      { length: 60 },
      (_, index) => `const a${index + 1} = a${index} + 1`,
    )
    let source = ['const a0 = s.length', ...chain, 'f([a15, a60, a40])'].join(
      '\n',
    )

    /**
     * Bounds the elements of the probe of the chain in an order, against bounds
     * that no question has read yet.
     *
     * @param order - Indexes of the elements, in the order to ask.
     * @returns The lower bound of each asked element, by index.
     */
    function ask(order: number[]): (number | null)[] {
      let file = createTestFile(source)
      let bounds = solveValueBounds(file.tree, file.scopes, new Set())
      let { elements } = findProbe(file) as ArrayExpression
      let lowers: (number | null)[] = [null, null, null]
      for (let index of order) {
        lowers[index] = getValueBound(bounds, elements[index]!)?.lower ?? null
      }
      return lowers
    }

    expect([0, 1, 2].map(index => ask([index])[index])).toStrictEqual([
      15,
      null,
      40,
    ])
    expect(ask([0, 1, 2])).toStrictEqual([15, null, 40])
    expect(ask([2, 1, 0])).toStrictEqual([15, null, 40])
    expect(ask([1, 0, 2])).toStrictEqual([15, null, 40])
  })

  it.each([
    {
      title: 'a name whose initializer reads it',
      source: 'const b = s.length + b',
    },
    {
      source: 'const b = ok ? s.length : c\nconst c = b + 1',
      title: 'a cycle of two names',
    },
    {
      source: [
        'const a0 = s.length',
        ...Array.from(
          { length: 300 },
          (_, index) => `const a${index + 1} = a${index} + 1`,
        ),
        'const b = a300 + 1',
      ].join('\n'),
      title: 'a name whose initializer is too deep',
    },
  ])(
    'reads no initializer again for later questions about $title',
    ({ source }) => {
      let file = createTestFile(`${source}\nf(b)`)
      let bounds = solveValueBounds(file.tree, file.scopes, new Set())
      let probe = findProbe(file)
      vi.mocked(getFixedInitializer).mockClear()

      expect(getValueBound(bounds, probe)).toBeNull()

      let first = vi.mocked(getFixedInitializer).mock.calls.length

      expect(first).toBeGreaterThan(0)
      expect(
        Array.from({ length: 50 }, () => getValueBound(bounds, probe)),
      ).toStrictEqual(Array.from({ length: 50 }, () => null))
      expect(getFixedInitializer).toHaveBeenCalledTimes(first)
    },
  )

  it('lists four clauses of a bound in full', () => {
    let maps = Array.from({ length: 4 }, (_, index) => `m${index}`)
    let source = [
      ...maps.map(name => `const ${name} = new Map()`),
      `f(${maps.map(name => `${name}.size`).join(' + ')})`,
    ].join('\n')

    expect(boundOf(source)!.because).toBe(
      maps
        .map(name => `\`${name}\` is a Map, whose size is never negative`)
        .join('; '),
    )
  })

  it('lists a repeated fact once when it follows four clauses', () => {
    let maps = Array.from({ length: 4 }, (_, index) => `m${index}`)
    let source = [
      ...maps.map(name => `const ${name} = new Map()`),
      `f(${sumSizes(maps)} + m0.size)`,
    ].join('\n')

    expect(boundOf(source)!.because).toBe(
      maps
        .map(name => `\`${name}\` is a Map, whose size is never negative`)
        .join('; '),
    )
  })

  it.each([
    {
      expected:
        '`m0` is a Map, whose size is never negative; `m1` is a Map, whose size is never negative; `m2` is a Map, whose size is never negative; and other facts',
      probe: (sum: string) => `f(${sum})`,
      title: 'a sum',
    },
    {
      expected:
        '`total` keeps its initial value; `m0` is a Map, whose size is never negative; `m1` is a Map, whose size is never negative; and other facts',
      probe: (sum: string) => `const total = ${sum}\nf(total)`,
      title: 'a name',
    },
  ])(
    'lists three clauses of $title of many facts and that others follow',
    ({ expected, probe }) => {
      let maps = Array.from({ length: 300 }, (_, index) => `m${index}`)
      let source = [
        ...maps.map(name => `const ${name} = new Map()`),
        probe(sumSizes(maps)),
      ].join('\n')

      expect(boundOf(source)).toStrictEqual(integer(0, expected))
    },
  )

  it('tells that others follow when only the second part of a sum has many facts', () => {
    let maps = Array.from({ length: 5 }, (_, index) => `m${index}`)
    let source = [
      ...maps.map(name => `const ${name} = new Map()`),
      `f(1 + ${sumSizes(maps)})`,
    ].join('\n')

    expect(boundOf(source)!.because).toBe(
      '`m0` is a Map, whose size is never negative; `m1` is a Map, whose size is never negative; `m2` is a Map, whose size is never negative; and other facts',
    )
  })

  it('keeps at most four clauses for every name that sums many facts', () => {
    let maps = Array.from({ length: 300 }, (_, index) => `m${index}`)
    let extra = Array.from({ length: 300 }, (_, index) => `e${index}`)
    let file = createTestFile(
      [
        ...[...maps, ...extra].map(name => `const ${name} = new Map()`),
        `const base = ${sumSizes(maps)}`,
        ...extra.map((name, index) => `const a${index} = base + ${name}.size`),
        `f([${extra.map((_, index) => `a${index}`).join(', ')}])`,
      ].join('\n'),
    )
    let bounds = solveValueBounds(file.tree, file.scopes, new Set())
    let { elements } = findProbe(file) as ArrayExpression
    for (let element of elements) {
      getValueBound(bounds, element!)
    }
    let kept = [...bounds.fixed.values()]

    expect(kept).toHaveLength(301)
    expect(Math.max(...kept.map(value => value!.reasons.length))).toBe(4)
  })

  it.each([
    { guards: ['depth > 0'], source: 'f(depth)' },
    { source: 'const level = depth\nf(level)', guards: ['depth > 0'] },
    { source: 'f(depth + 1)', guards: null },
  ])(
    'keeps the guards of a counter that $source reads',
    ({ source, guards }) => {
      let file = createTestFile(
        [
          'let depth = 3',
          'while (depth > 0) { depth--; use(depth) }',
          source,
        ].join('\n'),
      )
      let bound = getValueBound(
        solveValueBounds(file.tree, file.scopes, new Set()),
        findProbe(file),
      )

      expect(bound).toMatchObject({ lower: guards ? 0 : 1 })
      expect(
        bound!.guards &&
          [...bound!.guards].map(guard => file.sourceCode.getText(guard)),
      ).toStrictEqual(guards ?? undefined)
    },
  )

  it('bounds a fractional counter under > only by the literal', () => {
    expect(
      boundOf(
        [
          'let g = 0.5',
          'for (let item of items) {',
          "  if (item === '(') g += 1",
          '  else if (g > 0) g -= 1',
          '}',
          'f(g)',
        ].join('\n'),
      ),
    ).toMatchObject({ integer: false, lower: -1 })
  })

  it.each([
    {
      source: 'export let count = 0; let page = 0; page += 1; f(page)',
      title: 'a component counter',
    },
    {
      source:
        'let opened = 0; export function track() { opened += 1 } f(opened)',
      title: 'a counter of one script block of a component',
    },
    {
      title:
        'the size of a Set of a component, whose other blocks may declare Set',
      source: 'function g() { const seen = new Set(items); f(seen.size) }',
    },
  ])('gives no bound through $title', ({ source }) => {
    expect(boundOf(source, { component: true })).toBeNull()
  })

  it('bounds a function-local counter of a component', () => {
    expect(
      boundOf('function g() { let row = 0; row++; f(row) }', {
        component: true,
      }),
    ).toStrictEqual(integer(0, '`row` starts at 0 and only grows'))
  })
})
