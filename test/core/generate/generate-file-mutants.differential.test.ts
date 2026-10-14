import { describe, expect, it } from 'vitest'

import type { WeakMutants } from '../../helpers/find-weak-mutants'

import { findWeakMutants } from '../../helpers/find-weak-mutants'
import { generateMutants } from '../../helpers/generate-mutants'
import { applyMutant } from '../../helpers/apply-mutant'
import { runProgram } from '../../helpers/run-program'

/**
 * Idiom of the differential run: a function `f`, the inputs it is called with,
 * and the findings the catalog documents for it.
 */
interface Idiom {
  /**
   * Findings documented as gaps of catalog 11.8 under `strict` only.
   */
  strictGaps?: Partial<WeakMutants>

  /**
   * Findings documented as gaps of catalog 11.8 under both presets.
   */
  gaps?: Partial<WeakMutants>

  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Source lines; only the mutants of `f` are checked, so lines before it can
   * hold helpers that `f` calls.
   */
  lines: string[]

  /**
   * File name, whose extension selects the language.
   */
  file: string

  /**
   * Name of the idiom.
   */
  name: string
}

/**
 * Nothing found: the result of a check that passes.
 */
const NONE: WeakMutants = {
  equivalent: [],
  duplicates: [],
  uncovered: [],
  subsumed: [],
}

/**
 * Lists of items with ids, numbers, flags and tags.
 */
const ITEMS = [
  [],
  [{ b: false, tags: [], id: 'a', a: true, n: 1 }],
  [
    { tags: ['x'], b: false, id: 'a', a: true, n: 1 },
    { a: false, tags: [], id: 'b', b: true, n: 5 },
    { tags: ['y', 'z'], a: false, b: false, id: 'c', n: 3 },
    { tags: ['w'], id: 'd', a: true, b: true, n: 2 },
  ],
]

/**
 * Rows to sort, with ties, negative numbers and an order to keep.
 */
const SORT_ROWS = [
  [],
  [{ n: 2 }, { n: 1 }],
  [{ key: 'a', n: 1 }, { n: 3 }, { n: -2 }, { key: 'b', n: 1 }],
  [{ n: -1 }, { n: -3 }, { n: 0 }],
]

/**
 * Numbers around the literals of the idioms.
 */
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, -1, -2]

/**
 * Strings that tell apart cases, prefixes, suffixes and lookup keys.
 */
const STRINGS = [
  '',
  'a',
  'yes',
  'YES',
  'Yes',
  'abc#',
  '#x',
  '#',
  '/',
  'a/',
  '/a',
  '.md',
  '.mdx',
  'README.MD',
  'admin',
  'ADMIN',
  'an admin',
  'Get',
  'GET',
  'get',
  '404',
  'untitled',
  'anon',
  'foo',
]

/**
 * Comparator mutants that only the engine's sort tells apart (catalog 11.8): a
 * comparator that never returns a negative number leaves the array as it was,
 * like the removal of the call.
 */
const COMPARATOR_GAPS: Partial<WeakMutants> = {
  duplicates: [
    'method-call rows.toSorted((a, b) => a.n > b.n ? 1 : -1) -> rows | comparison-operator a.n > b.n -> a.n != b.n',
    'method-call rows.toSorted((a, b) => a.n > b.n ? 1 : -1) -> rows | number-literal -1 -> 0',
    'comparison-operator a.n > b.n -> a.n != b.n | number-literal -1 -> 0',
  ],
}

/**
 * The idioms of the catalog's differential run (12.6): filter predicates and
 * sort comparators of every form, `||` defaults of each type, case swaps,
 * branch returns, ternaries with literal branches, `slice(-1)`, boolean
 * results, a returned local, update statements, `||`/`&&` with literal operands
 * in a test, awaits, `typeof`, the min/max idiom and `??` defaults.
 */
const IDIOMS: Idiom[] = [
  {
    lines: [
      'function f(items: { id: string }[], id: string) {',
      '  return items.filter(item => item.id !== id)',
      '}',
    ],
    gaps: getCopyGaps(
      'items.filter(item => item.id !== id)',
      'comparison-operator item.id !== id -> true',
    ),
    inputs: combine(ITEMS, ['a', 'b', 'z']),
    name: 'a filter with !==',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { n: number }[], min: number) {',
      '  return items.filter(item => item.n >= min)',
      '}',
    ],
    gaps: getCopyGaps(
      'items.filter(item => item.n >= min)',
      'comparison-operator item.n >= min -> true',
    ),
    inputs: combine(ITEMS, NUMBERS),
    name: 'a filter with >=',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { a: boolean; b: boolean }[]) {',
      '  return items.filter(item => item.a || item.b)',
      '}',
    ],
    gaps: getCopyGaps(
      'items.filter(item => item.a || item.b)',
      'logical-operator item.a || item.b -> true',
    ),
    name: 'a filter with ||',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: { a: boolean; b: boolean }[]) {',
      '  return items.filter(item => item.a && item.b)',
      '}',
    ],
    name: 'a filter with &&',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    gaps: getCopyGaps(
      "items.filter(item => 'id' in item)",
      "comparison-operator 'id' in item -> true",
    ),
    lines: [
      'function f(items: object[]) {',
      "  return items.filter(item => 'id' in item)",
      '}',
    ],
    inputs: combine([[], [{ id: 1 }], [{ id: 1 }, {}]]),
    name: 'a filter with in',
    file: 'example.ts',
  },
  {
    gaps: getCopyGaps(
      'items.filter(item => item.tags.length > 0)',
      'comparison-operator item.tags.length > 0 -> item.tags.length >= 0',
    ),
    lines: [
      'function f(items: { tags: string[] }[]) {',
      '  return items.filter(item => item.tags.length > 0)',
      '}',
    ],
    name: 'a filter with a length',
    inputs: combine(ITEMS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows: { done: boolean }[]) {',
      '  return rows.filter(row => !row.done)',
      '}',
    ],
    gaps: getCopyGaps(
      'rows.filter(row => !row.done)',
      'condition !row.done -> true',
    ),
    inputs: combine([[], [{ done: true }], [{ done: false }, { done: true }]]),
    name: 'a filter with !',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows) {',
      '  return rows.filter(row => { if (row.x) return true; return false })',
      '}',
    ],
    gaps: getCopyGaps(
      'rows.filter(row => { if (row.x) return true; return false })',
      'condition row.x -> true',
    ),
    inputs: combine([[], [{ x: 1 }], [{ x: 0 }, { x: 2 }]]),
    name: 'a filter with a return switch',
    file: 'example.js',
  },
  {
    lines: [
      'function f(rows: { visible?: boolean }[]) {',
      '  return rows.filter(row => row.visible ?? false)',
      '}',
    ],
    inputs: combine([
      [],
      [{ visible: false }, {}],
      [{ visible: true }, {}, { visible: false }],
    ]),
    name: 'a filter with ?? false',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows, min) {',
      '  return rows.filter(row => { const n = row.n * 2; return n > min })',
      '}',
    ],
    inputs: combine([[], [{ n: 1 }, { n: 3 }, { n: 2 }, { n: 0 }]], NUMBERS),
    name: 'a filter with a sole return',
    file: 'example.js',
  },
  {
    lines: [
      'function f(rows: { n: number }[]) {',
      '  return rows.toSorted((a, b) => a.n - b.n)',
      '}',
    ],
    inputs: combine(SORT_ROWS),
    name: 'a sort comparator',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(rows) {',
      '  return rows.toSorted((a, b) => a.n > b.n ? 1 : -1)',
      '}',
    ],
    name: 'a sort comparator with a ternary',
    inputs: combine(SORT_ROWS),
    gaps: COMPARATOR_GAPS,
    file: 'example.js',
  },
  {
    lines: [
      'function f(name: string | undefined) {',
      "  return name || 'anon'",
      '}',
    ],
    name: 'an || default of a nullable string',
    inputs: [[undefined], [''], ['bob']],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(title: string) {',
      "  const heading = title || 'untitled'",
      '  return heading',
      '}',
    ],
    name: 'an || default of a string',
    inputs: [[''], ['x']],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number) {',
      '  const value = n || -1',
      '  return value',
      '}',
    ],
    name: 'an || default of a number',
    inputs: [[0], [1], [-1], [5]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number | undefined) {',
      '  const value = n || -1',
      '  return value',
      '}',
    ],
    inputs: [[undefined], [0], [1], [-1], [5]],
    name: 'an || default of a nullable number',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(answer: string) {',
      "  const yes = answer.toLowerCase() === 'yes'",
      '  return yes',
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a case swap with ===',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(method: string) {',
      "  if (method.toUpperCase() !== 'GET') reject()",
      '}',
    ],
    name: 'a case swap with !== in a test',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(code: string) {',
      "  return code.toLowerCase() === '404'",
      '}',
    ],
    name: 'a case swap without cased letters',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(name: string) {',
      "  if (name.toLowerCase().includes('admin')) grant()",
      '}',
    ],
    name: 'a case swap before includes',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(file: string) {',
      "  if (file.toLowerCase().endsWith('.md')) render()",
      '}',
    ],
    name: 'a case swap before endsWith',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(user: { isAdmin: boolean }): boolean {',
      '  if (user.isAdmin) return true',
      '  return false',
      '}',
    ],
    inputs: [[{ isAdmin: true }], [{ isAdmin: false }]],
    name: 'boolean returns after an if',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean): string {',
      "  if (ok) { return 'yes' } else { return '' }",
      '}',
    ],
    name: 'string returns of an if and else',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: ['function f(flag) {', '  return flag ? 1 : 0', '}'],
    inputs: [[true], [false], [0], ['x']],
    name: 'a ternary of numbers',
    file: 'example.js',
  },
  {
    gaps: {
      subsumed: [
        "comparison-operator path.slice(-1) === '/' -> false < method-call path.slice(-1) -> path",
      ],
    },
    lines: [
      'function f(path: string) {',
      "  return path.slice(-1) === '/'",
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a comparison of slice(-1)',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(parts: string[]) {',
      '  return parts.slice(-1)[0]',
      '}',
    ],
    inputs: [[[]], [['a']], [['a', 'b']]],
    name: 'an element of slice(-1)',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(text: string): boolean {',
      "  return text.startsWith('#')",
      '}',
    ],
    name: 'a boolean result of startsWith',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(roles: string[]): boolean {',
      "  return roles.includes('admin')",
      '}',
    ],
    inputs: [[[]], [['user']], [['admin', 'user']]],
    name: 'a boolean result of includes',
    file: 'example.ts',
  },
  {
    lines: ['function f(user) {', "  return user.roles.includes('admin')", '}'],
    inputs: [[{ roles: [] }], [{ roles: ['admin'] }]],
    name: 'a returned includes in JavaScript',
    file: 'example.js',
  },
  {
    lines: [
      'function f(path: string): boolean {',
      "  return path === '/'",
      '}',
    ],
    inputs: STRINGS.map(text => [text]),
    name: 'a boolean result of ===',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(a: number): boolean {',
      '  const ok = a > 2',
      '  return ok',
      '}',
    ],
    inputs: NUMBERS.map(value => [value]),
    name: 'a returned local comparison',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(x: { valid: boolean }): boolean {',
      '  return !x.valid',
      '}',
    ],
    inputs: [[{ valid: true }], [{ valid: false }]],
    name: 'a returned negation',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: number) {', '  if (x > 1) save(x)', '}'],
    name: 'a then-branch under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: ['function f() {', '  if (1) run()', '}'],
    name: 'a then-branch under a literal',
    file: 'example.js',
    inputs: [[]],
  },
  {
    lines: ['function f(count: number) {', '  count++', '  return count', '}'],
    inputs: NUMBERS.map(value => [value]),
    name: 'an update statement',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: string | undefined) {', "  if (x || '') go()", '}'],
    inputs: [[undefined], [''], ['a']],
    name: "an || '' in a test",
    file: 'example.ts',
  },
  {
    lines: [
      'function f(n: number | undefined) {',
      "  if (n && 'yes') go()",
      '}',
    ],
    inputs: [[undefined], [0], [3]],
    name: "an && 'yes' in a test",
    file: 'example.ts',
  },
  {
    lines: [
      'const api = {',
      '  get: (key: string) =>',
      "    key === 'bad' ? Promise.reject(new Error('nope')) : Promise.resolve({ key }),",
      '}',
      'async function f(id: string) {',
      '  const user = await api.get(id)',
      '  return user',
      '}',
    ],
    name: 'an awaited returned local',
    inputs: [['a'], ['bad']],
    file: 'example.ts',
  },
  {
    lines: [
      'function count(n: number): Promise<number> {',
      '  return Promise.resolve(n)',
      '}',
      'async function f(n: number) {',
      '  if ((await count(n)) === 0) stop()',
      '  return n',
      '}',
    ],
    name: 'an awaited number in a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: [
      'function ask(text: string): Promise<string> {',
      '  return Promise.resolve(text)',
      '}',
      'async function f(text: string) {',
      "  const yes = (await ask(text)) === 'y'",
      '  return yes',
      '}',
    ],
    name: 'an awaited string in a comparison',
    inputs: [['y'], ['n']],
    file: 'example.ts',
  },
  {
    lines: [
      'const client = {',
      '  search: (query: string) => Promise.resolve({ hits: [query] }),',
      '}',
      'async function f(query: string) {',
      '  const result = await client.search(query)',
      '  return result.hits',
      '}',
    ],
    name: 'a member of an awaited local',
    file: 'example.ts',
    inputs: [['a']],
  },
  {
    lines: [
      'function f(text: string) {',
      "  const found = text.includes('foo')",
      '  return found',
      '}',
    ],
    name: 'a returned local of includes',
    inputs: STRINGS.map(text => [text]),
    file: 'example.ts',
  },
  {
    gaps: {
      duplicates: [
        'method-call rows.toSorted((a, b) => { if (a.n < b.n) return -1; return 1 }) -> rows | comparison-operator a.n < b.n -> false',
        'method-call rows.toSorted((a, b) => { if (a.n < b.n) return -1; return 1 }) -> rows | number-literal -1 -> 0',
        'comparison-operator a.n < b.n -> false | number-literal -1 -> 0',
      ],
      equivalent: ['statement-removal return 1 -> ;'],
    },
    lines: [
      'function f(rows) {',
      '  return rows.toSorted((a, b) => { if (a.n < b.n) return -1; return 1 })',
      '}',
    ],
    name: 'a sort comparator with a return switch',
    inputs: combine(SORT_ROWS),
    file: 'example.js',
  },
  {
    lines: [
      'function f(text: string) {',
      "  const found = text.includes('foo')",
      '  use(found)',
      '  return 1',
      '}',
    ],
    inputs: [...STRINGS, 'a foo'].map(text => [text]),
    name: 'a used local of includes',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(value: unknown) {',
      "  return typeof value === 'string'",
      '}',
    ],
    inputs: [[1], ['a'], [undefined]],
    name: 'a typeof check',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(a: number, b: number) {',
      '  return a > b ? a : b',
      '}',
    ],
    inputs: combine(NUMBERS, NUMBERS),
    name: 'the max idiom',
    file: 'example.ts',
  },
  {
    strictGaps: {
      equivalent: ['logical-operator count ?? 0 -> count || 0'],
    },
    lines: ['function f(count: number | null) {', '  return count ?? 0', '}'],
    name: 'a ?? default of a nullable number',
    inputs: [[null], [0], [5]],
    file: 'example.ts',
  },
  {
    lines: ['function f(value) {', '  return value ?? 0', '}'],
    inputs: [[null], [undefined], [0], [''], [false], [5]],
    name: 'a ?? default of an unknown value',
    file: 'example.js',
  },
  {
    lines: [
      'function f(ok: boolean): boolean {',
      '  return ok ? true : false',
      '}',
    ],
    name: 'a ternary of booleans as a result',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean): boolean {',
      '  const label = ok ? true : false',
      '  return label',
      '}',
    ],
    name: 'a ternary of booleans in a returned local',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(x: number): boolean {',
      '  return x > 0 ? true : false',
      '}',
    ],
    name: 'a ternary of booleans under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(ok: boolean, a: boolean): boolean {',
      '  return ok ? a : false',
      '}',
    ],
    inputs: combine([true, false], [true, false]),
    name: 'a ternary with one boolean literal',
    file: 'example.ts',
  },
  {
    lines: ['function f(x: number) {', '  return x >= 5 ? 0 : 1', '}'],
    name: 'a ternary of numbers under a comparison',
    inputs: NUMBERS.map(value => [value]),
    file: 'example.ts',
  },
]

/**
 * Lists every combination of one value from each list.
 *
 * @param lists - Values of each argument.
 * @returns Argument lists, one per combination.
 */
function combine(...lists: unknown[][]): unknown[][] {
  let combinations: unknown[][] = [[]]
  for (let values of lists) {
    combinations = combinations.flatMap(combination =>
      values.map(value => [...combination, value]),
    )
  }
  return combinations
}

/**
 * Builds the duplicate that the differential run cannot tell apart in a filter:
 * a predicate that keeps every item makes `filter` return a copy of its
 * receiver, while the removal of the call returns the receiver itself. Outputs
 * compared by value see the same items in both.
 *
 * @param call - Text of the `filter` call.
 * @param mutant - Label of the mutant that keeps every item.
 * @returns The gaps of the idiom.
 */
function getCopyGaps(call: string, mutant: string): Partial<WeakMutants> {
  return {
    duplicates: [
      `method-call ${call} -> ${call.slice(0, call.indexOf('.'))} | ${mutant}`,
    ],
  }
}

describe('generateFileMutants', () => {
  /*
   * Strict keeps every coarse mutant, which duplicates or subsumes the finer
   * mutants inside it on purpose, so its run here turns them off to check the
   * finer mutants alone.
   */
  it.each(
    IDIOMS.flatMap(idiom => [
      {
        expected: { ...NONE, ...idiom.gaps },
        preset: 'recommended',
        ...idiom,
      },
      {
        expected: { ...NONE, ...idiom.gaps, ...idiom.strictGaps },
        preset: 'strict',
        ...idiom,
      },
    ]),
  )(
    'keeps no weak mutant in $name under $preset',
    async ({ expected, inputs, preset, lines, file }) => {
      let source = lines.join('\n')
      let mutants = generateMutants(source, {
        settings: { coarseMutants: false },
        preset,
        file,
      }).filter(mutant => mutant.start >= source.indexOf('function f('))
      let probes = await Promise.all(
        mutants.map(async mutant => ({
          label: `${mutant.mutator} ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
          outputs: await runProgram(applyMutant(source, mutant), file, inputs),
        })),
      )

      expect(mutants.length).toBeGreaterThan(0)
      expect(
        findWeakMutants(await runProgram(source, file, inputs), probes),
      ).toStrictEqual(expected)
    },
  )
})
