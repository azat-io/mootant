import { describe, expect, it } from 'vitest'

import type {
  UnsoundSkips,
  MutantProbe,
  SkipProbe,
} from '../../helpers/find-unsound-skips'
import type { WeakMutants } from '../../helpers/find-weak-mutants'

import { generateCandidates } from '../../helpers/generate-candidates'
import { findUnsoundSkips } from '../../helpers/find-unsound-skips'
import { findWeakMutants } from '../../helpers/find-weak-mutants'
import { createReader } from '../../helpers/create-reader'
import { applyMutant } from '../../helpers/apply-mutant'
import { runProgram } from '../../helpers/run-program'

/**
 * Idiom of the differential run: a function `f`, the inputs it is called with,
 * and the findings the catalog documents for it.
 */
interface Idiom {
  /**
   * Skipped candidates whose outputs contradict their category under both
   * presets, documented with the idiom.
   */
  unsoundSkips?: Partial<UnsoundSkips>

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
 * Regular expression idiom of the differential run: a function `f`, the inputs
 * it is called with, and the rules of the regex skips it checks.
 */
interface RegexIdiom {
  /**
   * Preset settings over those of the preset, such as `timeouts: false` for an
   * idiom whose empty matches would hang.
   */
  settings?: { timeouts: boolean }

  /**
   * Arguments of `f`, one list per input.
   */
  inputs: unknown[][]

  /**
   * Rules of the skipped regex candidates of `f` whose claims the run checks,
   * in canonical order.
   */
  skips: string[]

  /**
   * Source lines of `f`.
   */
  lines: string[]

  /**
   * Name of the file, `example.ts` when not given.
   */
  file?: string

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
 * No skipped candidate contradicts its category: the result of a check that
 * passes.
 */
const SOUND: UnsoundSkips = {
  equivalent: [],
  duplicate: [],
  subsumed: [],
  owned: [],
}

/**
 * Categories of skips whose claim the outputs can check; noise, timeout and
 * invalid candidates are not run.
 */
const CHECKED_CATEGORIES = new Set([
  'equivalent',
  'duplicate',
  'subsumed',
  'owned',
])

/**
 * Rules whose claim the outputs of one input cannot check: the solitary rule
 * says that a test which kills the finer mutant observes the removed code, not
 * that the coarse mutant differs on every input where the finer one does.
 */
const UNCHECKED_RULES = new Set(['solitary'])

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
 * Numbers around the literals of the idioms, with `-0` and `NaN`.
 */
const NUMBERS = [0, 1, 2, 3, 4, 5, 6, -1, -2, -0, Number.NaN]

/**
 * Times of dates before, at and after each other, and of an invalid date; each
 * run builds its own dates, so two equal dates are different objects.
 */
const TIMES = [0, 1000, Number.NaN]

/**
 * Strings that tell apart cases, prefixes, suffixes and lookup keys, with
 * letters whose case change alters the length.
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
  'ß',
  'aß',
  'İ',
]

/**
 * Strings that tell apart anchors, cases, line breaks, digits, word boundaries
 * and repeated matches of the regular expression idioms.
 */
const REGEX_STRINGS = [
  '',
  'a',
  'A',
  'aa',
  'ba',
  'abab',
  'ab\nab',
  '\nab',
  'xab',
  'abx',
  'a1',
  '123',
  '123-ab',
  '123-AB',
  '12-ab',
  '1234-ab',
  ' 123-ab',
  '123-ab ',
  '123-',
  '1x3-ab',
  'foo',
  'foobar',
  'a foo',
  '_foo',
  'foo.',
  'x1y22',
  'a\nb',
  'a.b',
  'acb',
  'bc',
  'b',
]

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
    gaps: {
      duplicates: [
        'comparison-operator a.n > b.n -> a.n != b.n | number-literal -1 -> 0',
      ],
    },
    lines: [
      'function f(rows) {',
      '  return rows.toSorted((a, b) => a.n > b.n ? 1 : -1)',
      '}',
    ],
    name: 'a sort comparator with a ternary',
    inputs: combine(SORT_ROWS),
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
        "comparison-operator path.slice(-1) === '/' -> false < unary-operator -1 -> 1",
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
    gaps: { subsumed: ['number-literal 0 -> 1 < unary-operator -1 -> 1'] },
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
    unsoundSkips: {
      equivalent: ['comparison-operator a > b -> a >= b (min-max-idiom)'],
    },
    inputs: combine(NUMBERS, NUMBERS),
    name: 'the max idiom',
    file: 'example.ts',
  },
  {
    lines: ['function f(count: number | null) {', '  return count ?? 0', '}'],
    inputs: [[null], [0], [5], [-0], [Number.NaN]],
    name: 'a ?? default of a nullable number',
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
  {
    lines: [
      'function f(rows: { n: number }[]) {',
      '  rows.sort((a, b) => a.n - b.n)',
      '  return rows.length',
      '}',
    ],
    name: 'an in-place sort of an input',
    inputs: combine(SORT_ROWS),
    file: 'example.ts',
  },
  {
    lines: [
      'function f(items: string[], item: string) {',
      '  if (!items.includes(item)) items.push(item)',
      '  return items',
      '}',
    ],
    inputs: combine([[], ['a'], ['a', 'b']], ['a', 'c']),
    name: 'a push into an input',
    file: 'example.ts',
  },
  {
    inputs: [
      ...combine(TIMES, TIMES).map(times =>
        times.map(time => new Date(time as number)),
      ),
      ...TIMES.map(time => {
        let date = new Date(time)
        return [date, date]
      }),
    ],
    lines: [
      'function f(start: Date, end: Date) {',
      '  return start < end',
      '}',
    ],
    name: 'a comparison of dates',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(start: Date, end: Date) {',
      '  return start.getTime() === end.getTime() ? start : end',
      '}',
    ],
    inputs: combine(TIMES, TIMES).map(times =>
      times.map(time => new Date(time as number)),
    ),
    name: 'a date chosen by its time',
    file: 'example.ts',
  },
  {
    inputs: [
      [undefined],
      [createReader({ name: 'ada' })],
      [createReader({ name: undefined })],
      [createReader({ name: '' })],
    ],
    lines: [
      'function f(user: { name?: string } | undefined) {',
      "  return user?.name ?? 'anon'",
      '}',
    ],
    name: 'an optional read of a getter',
    file: 'example.ts',
  },
  {
    lines: [
      'function f(config: { debug: boolean; level: number }) {',
      '  return config.debug && config.level > 1',
      '}',
    ],
    inputs: combine([true, false], [0, 1, 2]).map(([debug, level]) => [
      createReader({ debug, level }),
    ]),
    name: 'a && of getter reads',
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(id: string) {',
      "  await settle('save', id)",
      '  run(id)',
      '}',
    ],
    name: 'an awaited effect before a call',
    file: 'example.ts',
    inputs: [['a']],
  },
  {
    lines: [
      'async function f(ids: string[]) {',
      "  for (const id of ids) await settle('load', id)",
      '  return ids.length',
      '}',
    ],
    inputs: [[[]], [['a']], [['a', 'b']]],
    name: 'awaits in a loop',
    file: 'example.ts',
  },
  {
    lines: [
      'async function f(ok: boolean) {',
      '  try {',
      "    return await (ok ? settle('load', 1) : fail('load'))",
      '  } catch {',
      '    return 0',
      '  }',
      '}',
    ],
    name: 'a returned await inside try',
    inputs: [[true], [false]],
    file: 'example.ts',
  },
  {
    lines: [
      'function f(options) {',
      '  setTimeout(run, options && options.delay)',
      '}',
    ],
    inputs: [[null], [undefined], [{}], [{ delay: 5 }]],
    name: 'a timer delay behind a guard',
    file: 'example.js',
  },
  {
    lines: [
      'function f(options) {',
      '  setTimeout(run, options != null ? options.delay * 1000 : 0)',
      '}',
    ],
    gaps: { equivalent: ['comparison-operator options != null -> false'] },
    name: 'a timer delay behind a conditional guard',
    inputs: [[null], [{}], [{ delay: 5 }]],
    file: 'example.js',
  },
  {
    gaps: {
      equivalent: [
        "logical-operator typeof DELAY !== 'undefined' && DELAY -> typeof DELAY !== 'undefined'",
        "comparison-operator typeof DELAY !== 'undefined' -> false",
      ],
    },
    lines: [
      'function f() {',
      "  setTimeout(run, typeof DELAY !== 'undefined' && DELAY)",
      '}',
    ],
    unsoundSkips: { subsumed: ["string-literal 'undefined' -> '' (O4)"] },
    name: 'a timer delay behind a check of an undeclared global',
    file: 'example.js',
    inputs: [[]],
  },
  {
    lines: [
      'function f(ms) {',
      "  setTimeout(run, typeof ms === 'number' ? ms * 1000 : 0)",
      '}',
    ],
    gaps: {
      equivalent: ["comparison-operator typeof ms === 'number' -> false"],
    },
    unsoundSkips: { subsumed: ["string-literal 'number' -> '' (O4)"] },
    name: 'a timer delay behind a type check',
    inputs: [[1], [1n], [null]],
    file: 'example.js',
  },
  {
    lines: [
      "import { setTimeout as sleep } from 'node:timers/promises'",
      'async function f(ok) {',
      "  let operation = ok ? settle('a') : fail('b')",
      '  try {',
      '    await sleep(100, operation)',
      '  } catch (error) {',
      '    return error.message',
      '  }',
      "  return 'done'",
      '}',
    ],
    name: 'a promise timer that resolves with a pending operation',
    inputs: [[true], [false]],
    file: 'example.js',
  },
  {
    lines: [
      "import { setTimeout as sleep } from 'node:timers/promises'",
      'async function f(value) {',
      '  await sleep(100, null)',
      '  save(value)',
      '}',
    ],
    name: 'a promise timer that only waits',
    inputs: [[1], [2]],
    file: 'example.js',
  },
]

/**
 * Regular expression idioms: anchors, edge wildcards, global replaces and
 * matches, unused flags, assertions and a loop over global matches. Mutants of
 * regex patterns often subsume each other, so only the equivalence of regex
 * mutants and the claims of skips are checked.
 */
const REGEX_IDIOMS: RegexIdiom[] = [
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /^\d{3}-[a-z]+$/i.test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '123-z', '123-Z', '123-a']),
    name: 'a regular expression test with anchors',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /^[^]*ab[\s\S]*$/.exec(s)?.[0]`,
      '}',
    ],
    skips: ['edge-wildcard', 'any-character', 'edge-wildcard'],
    name: 'a regular expression with edge wildcards',
    inputs: combine([...REGEX_STRINGS, 'ab12']),
  },
  {
    lines: ['function f(s: string) {', "  return s.replace(/^a+/g, '-')", '}'],
    name: 'a global replace anchored at the start',
    inputs: combine(REGEX_STRINGS),
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\s+$/g, '!')`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'a  ', ' a \n ', '\n\n']),
    name: 'a global replace anchored at the end',
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\s*$/g, '!')`,
      '}',
    ],
    name: 'a global replace anchored at the end that matches empty',
    inputs: combine([...REGEX_STRINGS, 'a  ', ' a \n ']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/[\q{ab|}--\q{z}]$/gv, '!')`,
      '}',
    ],
    name: 'a global replace anchored after a set operation',
    inputs: combine([...REGEX_STRINGS, 'ab', 'zab']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return /a[\s\S\q{}]$/v.test(s)`,
      '}',
    ],
    name: 'a class of any character and the empty string',
    inputs: combine([...REGEX_STRINGS, 'ab', 'a ', 'b ']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.match(/\d/g) ? 1 : 2`,
      '}',
    ],
    name: 'a global match used as a condition',
    inputs: combine(REGEX_STRINGS),
    skips: ['unused-flag'],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\d+/gims, '#')`,
      '}',
    ],
    skips: ['unused-flag', 'unused-flag', 'unused-flag'],
    name: 'a global replace with unused flags',
    inputs: combine(REGEX_STRINGS),
  },
  {
    lines: ['function f(s: string) {', '  return s.match(/^a.|bc?$/gms)', '}'],
    name: 'a global match with line flags',
    inputs: combine(REGEX_STRINGS),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return s.replace(/\bfoo(?!bar)/g, 'X')`,
      '}',
    ],
    name: 'a replace with a word boundary and a lookahead',
    inputs: combine([...REGEX_STRINGS, 'FOO', 'foo foo']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      '  let pattern = /a+b?/g',
      '  let found = []',
      '  let match',
      '  while ((match = pattern.exec(s))) {',
      '    found.push(match.index)',
      '  }',
      '  return found',
      '}',
    ],
    inputs: combine(['', 'b', 'Ab', 'aab', 'ab aa']),
    name: 'a loop over global matches',
    settings: { timeouts: false },
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return new RegExp('^\\d{3}-[a-z]+$', 'i').test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '123-z', '123-Z', '123-a']),
    name: 'a RegExp call with an escaped string pattern',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return RegExp("\\\\|\"|b").test(s)`,
      '}',
    ],
    name: 'a RegExp call with escaped quotes and backslashes',
    inputs: combine([...REGEX_STRINGS, '\\', '"', 'b']),
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      "  return s.replace(new RegExp(String.raw`\\s+(?=\\d)`, 'g'), '_')",
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'a 1', 'a  1 b', ' 1 2']),
    name: 'a RegExp call with a String.raw pattern',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      "  return s.replace(RegExp(`^a+`, 'g'), '-')",
      '}',
    ],
    name: 'a RegExp call with a template pattern anchored at the start',
    inputs: combine(REGEX_STRINGS),
    skips: ['anchored-global'],
  },
  {
    lines: [
      'function f(s: string, word: string) {',
      `  return new RegExp(\`^\${word}$\`).test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, 'b', '$'], ['a', 'ab', '\\']),
    name: 'a RegExp call with a template that has an expression',
    skips: [],
  },
  {
    inputs: combine(
      [
        ...REGEX_STRINGS,
        'b',
        '1.a',
        '11.a',
        '.a',
        'x.a',
        '1.A',
        'z1.a',
        '1.az',
        '1xa',
      ],
      ['a', 'ab'],
    ),
    lines: [
      'function f(s, word) {',
      `  return new RegExp(\`^\${word}$\`).test(s) ||`,
      '    new RegExp(String.raw`^\\d+\\.a$`).test(s)',
      '}',
    ],
    name: 'RegExp calls with templates in JavaScript',
    file: 'example.js',
    skips: [],
  },
  {
    lines: [
      'function f(s: string) {',
      String.raw`  return new RegExp('^\0?1').test(s)`,
      '}',
    ],
    inputs: combine([...REGEX_STRINGS, '\u{0}1', '1', '\u{0}', '2']),
    name: 'a RegExp call with a null escape before a digit',
    skips: [],
  },
]

/**
 * Mutants and checked skipped candidates of `f` in a snippet, with the outputs
 * of each and of the original.
 */
interface IdiomProbes {
  /**
   * Skipped candidates of `f` whose category the outputs can check.
   */
  skipProbes: ({ mutator: string; rule: string } & SkipProbe)[]

  /**
   * Skipped candidates of `f` in a timer delay or a timer wait, with their
   * outputs under timers that ignore the delay.
   */
  delayProbes: SkipProbe[]

  /**
   * Mutants of `f` with their outputs.
   */
  probes: MutantProbe[]

  /**
   * Outputs of the original snippet.
   */
  original: string[]
}

/**
 * Generates the mutants and skipped candidates of a snippet without coarse
 * mutants, and runs the original and every mutant and checked skipped candidate
 * of `f` on every input.
 *
 * @param source - Snippet; only the code from `function f(` on is checked.
 * @param inputs - Arguments of `f`, one list per input.
 * @param setup - File name, whose extension selects the language, preset of the
 *   run and preset settings over those of the preset.
 * @returns Outputs of the original, the mutants and the skipped candidates.
 */
async function probeIdiom(
  source: string,
  inputs: unknown[][],
  setup: { settings?: { timeouts: boolean }; preset: string; file: string },
): Promise<IdiomProbes> {
  let { settings, preset, file } = setup
  let start = source.indexOf('function f(')
  let { mutants, skipped } = generateCandidates(source, {
    settings: { ...settings, coarseMutants: false },
    preset,
    file,
  })
  let probes = await Promise.all(
    mutants
      .filter(mutant => mutant.start >= start)
      .map(async mutant => ({
        label: `${mutant.mutator} ${source.slice(mutant.start, mutant.end)} -> ${mutant.replacement}`,
        outputs: await runProgram(applyMutant(source, mutant), file, inputs),
        mutator: mutant.mutator,
        start: mutant.start,
        id: mutant.id,
      })),
  )
  let skipProbes = await Promise.all(
    skipped
      .filter(
        candidate =>
          candidate.start >= start &&
          candidate.kind !== null &&
          CHECKED_CATEGORIES.has(candidate.category) &&
          !UNCHECKED_RULES.has(candidate.rule),
      )
      .map(async candidate => ({
        outputs: await runProgram(
          applyMutant(source, { ...candidate, kind: candidate.kind! }),
          file,
          inputs,
        ),
        label: `${candidate.mutator} ${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.rule})`,
        category: candidate.category,
        mutator: candidate.mutator,
        rule: candidate.rule,
        by: candidate.by,
      })),
  )
  let delayProbes = await Promise.all(
    skipped
      .filter(
        candidate =>
          candidate.start >= start &&
          candidate.kind !== null &&
          candidate.rule === 'timer-delay',
      )
      .map(async candidate => ({
        outputs: await runProgram(
          applyMutant(source, { ...candidate, kind: candidate.kind! }),
          file,
          inputs,
        ),
        label: `${candidate.mutator} ${source.slice(candidate.start, candidate.end)} -> ${candidate.replacement} (${candidate.rule})`,
        category: candidate.category,
        by: candidate.by,
      })),
  )
  let original = await runProgram(source, file, inputs)
  return { delayProbes, skipProbes, original, probes }
}

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
 * Finds the skipped candidates of a timer delay or a timer wait that change
 * more than how long a timer waits: the run uses timers that ignore the delay,
 * so such a candidate must have the outputs of the original.
 *
 * @param original - Outputs of the original program, in input order.
 * @param probes - Skipped candidates with the `timer-delay` rule.
 * @returns Labels of the candidates whose outputs differ from the original.
 */
function findDelayChanges(original: string[], probes: SkipProbe[]): string[] {
  return probes
    .filter(probe =>
      probe.outputs.some((output, index) => output !== original[index]),
    )
    .map(probe => probe.label)
}

describe('runProgram', () => {
  it.each([
    [
      'function f(items) { return items }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:*.arguments[0]}}',
    ],
    [
      'function f(items) { return [...items] }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:["a"]}}',
    ],
    [
      'function f(items) { items.pop() }',
      '{arguments:@.arguments[@.arguments[0][]],events:[["returned"]],result:{value:undefined:undefined}}',
    ],
    [
      'function f(items) { items[0] = items.at(0) }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:undefined:undefined}}',
    ],
    ['function f() { for (;;) {} }', 'hung'],
    ['async function f() { await null; for (;;) {} }', 'hung'],
    [
      'function f() { return new Promise(() => {}) }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[],result:{pending:boolean:true}}',
    ],
    [
      "async function f() { settle('a'); run() }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["run"],["returned"],["settled","a"]],result:{value:undefined:undefined}}',
    ],
    [
      "function f() { void (async () => { await settle('a'); await settle('b'); save() })() }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"],["settled","a"],["settled","b"],["save"]],result:{value:undefined:undefined}}',
    ],
    [
      "async function f() { try { await fail('a') } catch (error) { return error.message } }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["failed","a"],["returned"]],result:{value:"a"}}',
    ],
    [
      "function f() { throw new Error('no') }",
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{thrown:"no"}}',
    ],
    [
      'function f() { let list = []; Object.defineProperty(list, 0, { get: () => run(), enumerable: true }); return list }',
      '{arguments:@.arguments[@.arguments[0]["a"]],events:[["returned"]],result:{value:[<get>]}}',
    ],
  ])('observes %s', async (source, expected) => {
    await expect(
      runProgram(source, 'example.js', [[['a']]]),
    ).resolves.toStrictEqual([expected])
  })

  it('tells a replaced object from the one that existed before the run', async () => {
    let input = [[{ items: ['a'] }]]
    let [replaced] = await runProgram(
      'function f(box) { box.items = box.items.filter(() => true) }',
      'example.js',
      input,
    )
    let [kept] = await runProgram(
      'function f(box) { box.items = box.items }',
      'example.js',
      input,
    )

    expect(replaced).not.toBe(kept)
  })

  it('observes the reads of a getter without calling it when describing', async () => {
    await expect(
      runProgram(
        'function f(user) { return user.name + user.name }',
        'example.js',
        [[createReader({ name: 'a' })]],
      ),
    ).resolves.toStrictEqual([
      '{arguments:@.arguments[@.arguments[0]{name:<get>}],events:[["read","name"],["read","name"],["returned"]],result:{value:"aa"}}',
    ])
  })
})

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
    'keeps no weak mutant and no unsound skip in $name under $preset',
    async ({ unsoundSkips, expected, inputs, preset, lines, file }) => {
      let { delayProbes, skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { preset, file },
      )

      expect(probes.length).toBeGreaterThan(0)
      expect(findWeakMutants(original, probes)).toStrictEqual(expected)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual({
        ...SOUND,
        ...unsoundSkips,
      })
      expect(findDelayChanges(original, delayProbes)).toStrictEqual([])
    },
  )

  it.each(
    REGEX_IDIOMS.flatMap(idiom => [
      { preset: 'recommended', ...idiom },
      { preset: 'strict', ...idiom },
    ]),
  )(
    'keeps no equivalent regex mutant and no unsound skip in $name under $preset',
    async ({ file = 'example.ts', settings, inputs, preset, skips, lines }) => {
      let { skipProbes, original, probes } = await probeIdiom(
        lines.join('\n'),
        inputs,
        { settings, preset, file },
      )

      expect(
        probes.filter(probe => probe.mutator.startsWith('regex-')).length,
      ).toBeGreaterThan(0)
      expect(
        findWeakMutants(original, probes).equivalent.filter(label =>
          label.startsWith('regex-'),
        ),
      ).toStrictEqual([])
      expect(
        skipProbes
          .filter(probe => probe.mutator.startsWith('regex-'))
          .map(probe => probe.rule),
      ).toStrictEqual(skips)
      expect(findUnsoundSkips(original, probes, skipProbes)).toStrictEqual(
        SOUND,
      )
    },
  )
})
