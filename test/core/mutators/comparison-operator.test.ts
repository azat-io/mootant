import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Lists the mutants of comparison-operator for a snippet.
 *
 * @param source - Text of the snippet.
 * @param setup - Preset, mutator settings, preset settings and file name of the
 *   run.
 * @returns Mutants as `original -> replacement`.
 */
function mutate(source: string, setup: MutatorSetup = {}): string[] {
  return runMutator('comparison-operator', source, setup).map(formatMutant)
}

describe('comparisonOperator', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      source: ['function f(a: number, b: number) {', '  x = a < b', '}'].join(
        '\n',
      ),
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
    },
    {
      expected: [
        'a >= 10 -> a > 10',
        'a >= 10 -> a == 10',
        'a >= 10 -> a >= 9',
      ],
      source: ['function f(a: number) {', '  x = a >= 10', '}'].join('\n'),
    },
    {
      source: ['function f(a: number, b: number) {', '  x = a === b', '}'].join(
        '\n',
      ),
      expected: ['a === b -> a <= b', 'a === b -> a >= b', 'a === b -> false'],
    },
    {
      source: ['function f(mode: string) {', "  x = mode === 'dark'", '}'].join(
        '\n',
      ),
      expected: ["mode === 'dark' -> true", "mode === 'dark' -> false"],
    },
    {
      expected: ['key in map -> true', 'key in map -> false'],
      source: 'x = key in map',
    },
    {
      source: [
        'class Box {',
        '  #size = 0',
        '  static has(box) {',
        '    return #size in box',
        '  }',
        '}',
      ].join('\n'),
      expected: ['#size in box -> true', '#size in box -> false'],
    },
  ])('emits the plan of $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(list: string[]) {',
        '  x = list.length > 0',
        '}',
      ].join('\n'),
      expected: [
        'list.length > 0 -> list.length >= 0',
        'list.length > 0 -> list.length > 1',
      ],
    },
    {
      expected: [
        'list.indexOf(s) > -1 -> list.indexOf(s) >= -1',
        'list.indexOf(s) > -1 -> list.indexOf(s) > 0',
      ],
      source: [
        'function f(list: string[], s: string) {',
        '  x = list.indexOf(s) > -1',
        '}',
      ].join('\n'),
    },
    {
      source: [
        'function f(list: string[], s: string) {',
        '  x = list.indexOf(s) !== -1',
        '}',
      ].join('\n'),
      expected: [
        'list.indexOf(s) !== -1 -> list.indexOf(s) < -1',
        'list.indexOf(s) !== -1 -> true',
      ],
    },
    {
      source: [
        'function f(s: string) {',
        "  const at = s.indexOf(':')",
        '  if (at === -1) run()',
        '}',
      ].join('\n'),
      expected: ['at === -1 -> at >= -1', 'at === -1 -> false'],
    },
    {
      source: [
        'function f(list: string[]) {',
        '  x = list.length >= 0',
        '}',
      ].join('\n'),
      expected: [
        'list.length >= 0 -> list.length > 0',
        'list.length >= 0 -> list.length == 0',
      ],
    },
    {
      expected: [
        'item.size >= 0 -> item.size > 0',
        'item.size >= 0 -> item.size == 0',
        'item.size >= 0 -> item.size >= -1',
      ],
      source: ['function f(item: Item) {', '  x = item.size >= 0', '}'].join(
        '\n',
      ),
    },
    {
      expected: [
        'buffer.byteLength >= 0 -> buffer.byteLength > 0',
        'buffer.byteLength >= 0 -> buffer.byteLength == 0',
        'buffer.byteLength >= 0 -> buffer.byteLength >= -1',
      ],
      source: [
        'function f(buffer: Item) {',
        '  x = buffer.byteLength >= 0',
        '}',
      ].join('\n'),
    },
  ])(
    'skips regions a lower bound rules out in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(value: string) {',
        "  x = typeof value === 'string'",
        '}',
      ].join('\n'),
      expected: ["typeof value === 'string' -> false"],
    },
    {
      source: [
        'interface User {}',
        'function f(user: User) {',
        '  x = user === null',
        '}',
      ].join('\n'),
      expected: ['user === null -> true'],
    },
    {
      source: [
        "import type { User } from './user'",
        'function f(user: User) {',
        '  x = user === null',
        '}',
      ].join('\n'),
      expected: ['user === null -> true', 'user === null -> false'],
    },
    {
      source: [
        'function f(a: number, b: number) {',
        '  x = a > b ? a : b',
        '}',
      ].join('\n'),
      expected: ['a > b -> a != b', 'a > b -> false'],
    },
  ])('skips the equivalent entries of $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
      source: 'function min(a, b) {\n  return a < b ? a : b\n}',
    },
    {
      source: 'function min(b) {\n  let a = 0\n  return a < b ? a : b\n}',
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
    },
  ])(
    'keeps the min/max entries of operands of unknown types in $source',
    ({ expected, source }) => {
      expect(mutate(source, { file: 'example.js' })).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(items: Item[], id: string) {',
        '  return items.filter((item) => item.id !== id)',
        '}',
      ].join('\n'),
      expected: ['item.id !== id -> true', 'item.id !== id -> false'],
    },
    {
      source: [
        'function f(items: Item[], min: number) {',
        '  return items.filter((item) => item.n >= min)',
        '}',
      ].join('\n'),
      expected: [
        'item.n >= min -> item.n > min',
        'item.n >= min -> item.n == min',
        'item.n >= min -> true',
      ],
    },
    {
      source: [
        'function f(items: Item[]) {',
        '  return items.filter((item) => item.tags.length > 0)',
        '}',
      ].join('\n'),
      expected: [
        'item.tags.length > 0 -> item.tags.length >= 0',
        'item.tags.length > 0 -> item.tags.length > 1',
      ],
    },
    {
      source: [
        'function f(items: number[]) {',
        '  return items.filter((x) => x > 0).sort()',
        '}',
      ].join('\n'),
      expected: ['x > 0 -> x >= 0', 'x > 0 -> x != 0', 'x > 0 -> x > 1'],
    },
  ])(
    'keeps the constants of a filter predicate in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(items: Item[], min: number) {',
        '  return items.sort((p, q) => p.n < min)',
        '}',
      ].join('\n'),
      expected: ['p.n < min -> p.n <= min', 'p.n < min -> p.n != min'],
    },
    {
      source: [
        'function f(items: Item[], min: number) {',
        '  return items.toSorted((p, q) => p.n < min)',
        '}',
      ].join('\n'),
      expected: [
        'p.n < min -> p.n <= min',
        'p.n < min -> p.n != min',
        'p.n < min -> false',
      ],
    },
  ])(
    'leaves the mutants that empty a sort comparator to method-call in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        'i <= 10 -> i < 10',
        'i <= 10 -> i == 10',
        'i <= 10 -> i <= 11',
      ],
      source: 'for (let i = 0; i <= 10; i++) run(i)',
    },
    {
      expected: ['count < n -> count <= n', 'count < n -> false'],
      source: 'while (count < n) count++',
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = 0; i !== n; i++) total += i',
        '}',
      ].join('\n'),
      expected: ['i !== n -> i > n'],
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = n; i !== 0; i--) total += i',
        '}',
      ].join('\n'),
      expected: ['i !== 0 -> i < 0'],
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = 0; n !== i; i++) total += i',
        '}',
      ].join('\n'),
      expected: ['n !== i -> n < i'],
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = 0, j = n; i !== j; i++, j--) run(i)',
        '}',
      ].join('\n'),
      expected: ['i !== j -> i < j', 'i !== j -> i > j'],
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = 0; i !== n; i += step) run(i)',
        '}',
      ].join('\n'),
      expected: ['i !== n -> i < n', 'i !== n -> i > n'],
    },
    {
      expected: [
        'i !== boxes -> i < boxes',
        'i !== boxes -> i > boxes',
        'i > 100 -> i >= 100',
        'i > 100 -> i != 100',
        'i > 100 -> i > 101',
      ],
      source: [
        'function f(boxes: number) {',
        '  for (let i = 0; i !== boxes; i++) {',
        '    if (i > 100) break',
        '  }',
        '}',
      ].join('\n'),
    },
    {
      expected: [
        'i !== boxes -> i < boxes',
        'i !== boxes -> i > boxes',
        'i > 100 -> i >= 100',
        'i > 100 -> i != 100',
        'i > 100 -> i > 101',
      ],
      source: [
        'function f(boxes: number) {',
        '  for (let i = 0; i !== boxes; i++) {',
        '    if (i > 100) fail()',
        '  }',
        '}',
      ].join('\n'),
    },
    {
      expected: [
        '++attempts > limit -> ++attempts >= limit',
        '++attempts > limit -> ++attempts != limit',
      ],
      source: ['for (;;) {', '  if (++attempts > limit) break', '}'].join('\n'),
    },
    {
      source: [
        'function f(n: number) {',
        '  for (;;) {',
        '    if (i >= n) break',
        '    i++',
        '  }',
        '}',
      ].join('\n'),
      expected: ['i >= n -> i > n'],
    },
    {
      source: [
        'function f(n: number) {',
        '  let i = 0',
        '  while (true) {',
        '    total += i',
        '    if (i === n) break',
        '    i++',
        '  }',
        '}',
      ].join('\n'),
      expected: ['i === n -> i <= n'],
    },
  ])('skips the timeout entries of $source', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        'count < n -> count <= n',
        'count < n -> count != n',
        'count < n -> false',
      ],
      source: 'while (count < n) count++',
    },
    {
      expected: [
        '++attempts > limit -> ++attempts >= limit',
        '++attempts > limit -> ++attempts != limit',
        '++attempts > limit -> false',
      ],
      source: ['for (;;) {', '  if (++attempts > limit) break', '}'].join('\n'),
    },
    {
      source: [
        'function f(n: number) {',
        '  for (let i = 0; i !== n; i++) run(i)',
        '}',
      ].join('\n'),
      expected: ['i !== n -> i < n', 'i !== n -> i > n', 'i !== n -> true'],
    },
  ])(
    'emits the timeout entries of $source with timeouts',
    ({ expected, source }) => {
      expect(mutate(source, { settings: { timeouts: true } })).toStrictEqual(
        expected,
      )
    },
  )

  it('emits the timeout entries in the strict preset', () => {
    expect(
      mutate('while (count < n) count++', { preset: 'strict' }),
    ).toStrictEqual([
      'count < n -> count <= n',
      'count < n -> count != n',
      'count < n -> false',
    ])
  })

  it.each<{ expected: string[]; source: string; file: string }>([
    {
      source: [
        'function f(a: number) {',
        '  if (a > 0 && isActive) run()',
        '}',
      ].join('\n'),
      expected: ['a > 0 -> a >= 0', 'a > 0 -> a != 0', 'a > 0 -> a > 1'],
      file: 'example.ts',
    },
    {
      source: [
        'function List({ items }: { items: string[] }) {',
        '  return <ul>{items.length > 0 && <Item />}</ul>',
        '}',
      ].join('\n'),
      expected: [
        'items.length > 0 -> items.length >= 0',
        'items.length > 0 -> items.length > 1',
      ],
      file: 'example.tsx',
    },
    {
      source: [
        'function Busy({ status }: { status: string }) {',
        "  return <div>{status === 'busy' && <Spinner />}</div>",
        '}',
      ].join('\n'),
      expected: ["status === 'busy' -> false"],
      file: 'example.tsx',
    },
    {
      source: [
        'function Busy({ status }: { status: string }) {',
        "  return <div>{!(status === 'busy') || <Spinner />}</div>",
        '}',
      ].join('\n'),
      expected: ["status === 'busy' -> false"],
      file: 'example.tsx',
    },
    {
      expected: [
        'x === 0 -> x <= 0',
        'x === 0 -> x >= 0',
        'y > 3 -> y >= 3',
        'y > 3 -> y != 3',
        'y > 3 -> y > 4',
      ],
      source: [
        'function f(x, y, z) {',
        '  return x === 0 && y > 3 && isOk(z)',
        '}',
      ].join('\n'),
      file: 'example.js',
    },
    {
      source: ['function f(x) {', '  return x === 0 && isValid(x)', '}'].join(
        '\n',
      ),
      expected: ['x === 0 -> x <= 0', 'x === 0 -> x >= 0'],
      file: 'example.js',
    },
    {
      source: ['function f(x) {', '  return isValid(x) && x === 0', '}'].join(
        '\n',
      ),
      expected: ['x === 0 -> x <= 0', 'x === 0 -> x >= 0', 'x === 0 -> false'],
      file: 'example.js',
    },
  ])(
    'leaves the constants of logical operands to logical-operator in $source',
    ({ expected, source, file }) => {
      expect(mutate(source, { file })).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
      source: 'x = (a < b) && c',
    },
    {
      expected: ['a < b -> a <= b', 'a < b -> a != b'],
      source: 'x = (a < b) || c',
    },
    {
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
      source: 'x = c || a < b',
    },
    {
      expected: ['a instanceof B -> false'],
      source: 'x = (a instanceof B) && c',
    },
  ])(
    'skips only the drop of the left operand in the value group $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        'a < b < c -> a < b <= c',
        'a < b < c -> a < b != c',
        'a < b < c -> false',
        'a < b -> a <= b',
        'a < b -> (a != b)',
        'a < b -> false',
      ],
      source: 'x = a < b < c',
    },
    {
      expected: [
        'q === a < b -> true',
        'q === a < b -> false',
        'a < b -> a <= b',
        'a < b -> (a != b)',
        'a < b -> false',
      ],
      source: 'x = q === a < b',
    },
    {
      expected: ['a < b -> a <= b', 'a < b -> (a != b)', 'a < b -> false'],
      source: 'x = a < b as boolean',
    },
    {
      expected: [
        '(a <= b) > c -> (a <= b) >= c',
        '(a <= b) > c -> (a <= b) != c',
        '(a <= b) > c -> false',
        'a <= b -> a < b',
        'a <= b -> a == b',
        'a <= b -> true',
      ],
      source: 'x = (a <= b) > c',
    },
  ])(
    'guards the operands of $source inside the text',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it('leaves the never-run mutant of a first exit test to condition', () => {
    let source = [
      'for (;;) {',
      '  if (index >= limit) break',
      '  index = next(index)',
      '}',
    ].join('\n')
    let setup = { settings: { timeouts: true } }

    expect(mutate(source, setup)).toStrictEqual([
      'index >= limit -> index > limit',
      'index >= limit -> index == limit',
    ])
    expect(
      runMutator('condition', source, setup).map(formatMutant),
    ).toStrictEqual([
      [
        'for (;;) {',
        '  if (index >= limit) break',
        '  index = next(index)',
        '} -> for (;false;) {',
        '  if (index >= limit) break',
        '  index = next(index)',
        '}',
      ].join('\n'),
    ])
  })

  it('owns the literal operands of comparisons', () => {
    let source = ['function f(a: number) {', '  x = a >= 10', '}'].join('\n')

    expect(runMutator('number-literal', source)).toStrictEqual([])
    expect(mutate(source)).toContain('a >= 10 -> a >= 9')
  })

  it.each<{
    setup: MutatorSetup
    expected: string[]
    situation: string
    lines: string[]
  }>([
    {
      lines: ['if (x > 1) save(x)'],
      situation: 'it runs',
      expected: [],
      setup: {},
    },
    {
      lines: [
        '// mootant-ignore-next-line comparison-operator, condition: fixed',
        'if (x > 1) save(x)',
      ],
      situation: 'it and condition are ignored',
      expected: ['save(x) -> ;'],
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off', condition: 'off' } },
      situation: 'it and condition are off',
      lines: ['if (x > 1) save(x)'],
      expected: ['save(x) -> ;'],
    },
    {
      setup: { mutators: { 'comparison-operator': 'off' } },
      situation: "it is off, since condition's false runs",
      lines: ['if (x > 1) save(x)'],
      expected: [],
    },
  ])(
    'justifies skipping the removal of a then-branch while $situation',
    ({ expected, setup, lines }) => {
      expect(
        runMutator('statement-removal', lines.join('\n'), setup).map(
          formatMutant,
        ),
      ).toStrictEqual(expected)
    },
  )

  it.each<{
    setup: MutatorSetup
    expected: string[]
    situation: string
    lines: string[]
  }>([
    {
      lines: ['x = x >= 5 ? 0 : 1'],
      situation: 'it runs',
      expected: ['1 -> 2'],
      setup: {},
    },
    {
      lines: [
        '// mootant-ignore-next-line comparison-operator, condition: fixed',
        'x = x >= 5 ? 0 : 1',
      ],
      situation: 'it and condition are ignored',
      expected: ['5 -> 6', '0 -> 1', '1 -> 2'],
      setup: {},
    },
    {
      setup: { mutators: { 'comparison-operator': 'off', condition: 'off' } },
      expected: ['5 -> 6', '0 -> 1', '1 -> 2'],
      situation: 'it and condition are off',
      lines: ['x = x >= 5 ? 0 : 1'],
    },
    {
      setup: { mutators: { 'comparison-operator': 'off' } },
      situation: "it is off, since condition's false runs",
      expected: ['5 -> 6', '1 -> 2'],
      lines: ['x = x >= 5 ? 0 : 1'],
    },
  ])(
    'justifies skipping a branch made equal to the other while $situation',
    ({ expected, setup, lines }) => {
      expect(
        runMutator('number-literal', lines.join('\n'), setup).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; situation: string }>([
    { situation: 'it runs', expected: [], setup: {} },
    {
      setup: { mutators: { 'comparison-operator': 'off' } },
      expected: ['await count() -> count()'],
      situation: 'it is off',
    },
  ])(
    'justifies skipping a removed await in a comparison while $situation',
    ({ expected, setup }) => {
      let source = [
        'async function f() {',
        '  if ((await count()) === 0) stop()',
        '}',
      ].join('\n')

      expect(
        runMutator('missing-await', source, setup).map(formatMutant),
      ).toStrictEqual(expected)
      expect(mutate(source)).toStrictEqual([
        '(await count()) === 0 -> (await count()) <= 0',
        '(await count()) === 0 -> (await count()) >= 0',
        '(await count()) === 0 -> false',
      ])
    },
  )

  it('emits nothing for an operator that does not compare', () => {
    expect(runMutator('comparison-operator', 'x = a + b')).toStrictEqual([])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['0 < a -> 0 <= a', '0 < a -> 0 != a', '0 < a -> 1 < a'],
      source: 'x = 0 < a',
    },
    {
      expected: [
        '10 >= a -> 10 > a',
        '10 >= a -> 10 == a',
        '10 >= a -> 11 >= a',
      ],
      source: 'x = 10 >= a',
    },
    {
      expected: [
        'a > 10n -> a >= 10n',
        'a > 10n -> a != 10n',
        'a > 10n -> a > 11n',
      ],
      source: 'x = a > 10n',
    },
    {
      expected: [
        'a <= -2 -> a < -2',
        'a <= -2 -> a == -2',
        'a <= -2 -> a <= -1',
      ],
      source: 'x = a <= -2',
    },
    {
      expected: [
        'a < 1e20 -> a <= 1e20',
        'a < 1e20 -> a != 1e20',
        'a < 1e20 -> false',
      ],
      source: 'x = a < 1e20',
    },
    {
      expected: ['1 < 2 -> 1 <= 2', '1 < 2 -> 1 != 2', '1 < 2 -> false'],
      source: 'x = 1 < 2',
    },
  ])('moves the literal of $source one step', ({ expected, source }) => {
    expect(mutate(source)).toStrictEqual(expected)
  })

  it('reports the mutants with their positions and kind', () => {
    expect(runMutator('comparison-operator', 'x = key in map')).toStrictEqual([
      {
        mutator: 'comparison-operator',
        original: 'key in map',
        replacement: 'true',
        kind: 'expression',
        status: 'Pending',
        reason: null,
        scope: null,
        column: 5,
        line: 1,
      },
      {
        mutator: 'comparison-operator',
        original: 'key in map',
        replacement: 'false',
        kind: 'expression',
        status: 'Pending',
        reason: null,
        scope: null,
        column: 5,
        line: 1,
      },
    ])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a < b -> a <= b', 'a < b -> a != b', 'a < b -> false'],
      source: 'if (!(a < b)) x()',
    },
    {
      expected: ["'k' in map -> true", "'k' in map -> false"],
      source: "x = 'k' in map",
    },
    {
      expected: [
        "s.indexOf('x') > 0 -> s.indexOf('x') >= 0",
        "s.indexOf('x') > 0 -> s.indexOf('x') != 0",
        "s.indexOf('x') > 0 -> s.indexOf('x') > 1",
      ],
      source: "x = s.indexOf('x') > 0",
    },
    {
      expected: [
        "answer.toLowerCase() === 'yes' -> true",
        "answer.toLowerCase() === 'yes' -> false",
      ],
      source: [
        'declare let answer: string',
        "x = answer.toLowerCase() === 'yes'",
      ].join('\n'),
    },
  ])(
    'owns the decision that other mutators leave in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: [
        'function f(x: (() => void) & { id: string }) {',
        "  if (typeof x === 'function') run()",
        '}',
      ].join('\n'),
      expected: ["typeof x === 'function' -> false"],
    },
    {
      source: [
        'interface Handler { (e: number): void }',
        'function f(x: Handler) {',
        "  if (typeof x === 'function') run()",
        '}',
      ].join('\n'),
      expected: ["typeof x === 'function' -> false"],
    },
  ])(
    'reads object-like function types as functions in $source',
    ({ expected, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
    },
  )

  it.each<[string, string[]]>([
    [
      'function f(list: string[], a: number, b: number) { if (list.length > 0 && a < b) run() }',
      [
        'list.length > 0 -> list.length != 0 (equivalent lower-bound)',
        'a < b -> false (owned O3)',
      ],
    ],
    [
      'function f(a: number, b: number) { while (a < b) a++ }',
      ['a < b -> a != b (timeout loop-running)'],
    ],
  ])('lists the skipped entries of %s', (source, expected) => {
    expect(listSkipped('comparison-operator', source)).toStrictEqual(expected)
  })

  it.each<{ expected: string[]; skipped: string[]; source: string }>([
    {
      expected: [
        "typeof DELAY === 'number' -> true",
        "typeof DELAY === 'number' -> false",
      ],
      source: "setTimeout(run, typeof DELAY === 'number' ? DELAY : 1000)",
      skipped: [],
    },
    {
      expected: [
        "typeof ms === 'number' -> true",
        "typeof ms === 'number' -> false",
      ],
      source: "setTimeout(run, typeof ms === 'number' ? ms * 1000 : 0)",
      skipped: [],
    },
    {
      expected: [
        "typeof ms === 'number' -> true",
        "typeof ms === 'number' -> false",
      ],
      source: "setTimeout(run, typeof ms === 'number' ? 1000 : 0)",
      skipped: [],
    },
  ])(
    'keeps the type checks in the timer delay of $source',
    ({ expected, skipped, source }) => {
      expect(mutate(source)).toStrictEqual(expected)
      expect(listSkipped('comparison-operator', source)).toStrictEqual(skipped)
    },
  )
})
