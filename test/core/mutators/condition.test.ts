import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Parameters with the types of the catalog's examples.
 */
const PARAMETERS = [
  'flag: boolean',
  'items: string[]',
  'el: Element | null',
  'enabled: boolean | undefined',
  'value: unknown',
  'nothing: null',
].join(', ')

describe('condition', () => {
  it.each<{ expected: string[]; body: string }>([
    {
      expected: ['flag -> true', 'flag -> false'],
      body: "x = flag ? 'yes' : 'no'",
    },
    {
      expected: ['flag -> true', 'flag -> false'],
      body: 'x = ((flag)) ? 1 : 2',
    },
    {
      expected: ['items -> false'],
      body: 'if (items) run()',
    },
    {
      expected: ['!items -> true'],
      body: 'if (!items) run()',
    },
    {
      expected: ['el -> true', 'el -> false'],
      body: 'if (el) show(el)',
    },
    {
      expected: ['nothing -> true'],
      body: 'if (nothing) run()',
    },
    {
      expected: ['!nothing -> false'],
      body: 'if (!nothing) run()',
    },
    {
      body: 'while (items.length) handle(items.shift())',
      expected: ['items.length -> false'],
    },
    {
      body: 'do handle(items.shift()); while (items.length)',
      expected: ['items.length -> false'],
    },
    {
      body: 'for (let i = 0; items.length; i++) handle(items.shift())',
      expected: ['items.length -> false'],
    },
    {
      expected: ['!flag -> true', '!flag -> false'],
      body: 'let negated = !flag',
    },
    {
      expected: ['!!value -> true', '!!value -> false'],
      body: 'm = !!value',
    },
    {
      expected: ['!x.done -> true', '!x.done -> false'],
      body: 'list.map((x) => !x.done)',
    },
    {
      expected: ['!(flag as boolean) -> true', '!(flag as boolean) -> false'],
      body: 'x = !(flag as boolean)',
    },
    {
      expected: ['flag as boolean -> true', 'flag as boolean -> false'],
      body: 'if (flag as boolean) run()',
    },
  ])('forces $body', ({ expected, body }) => {
    let source = [`function f(${PARAMETERS}) {`, `  ${body}`, '}'].join('\n')

    expect(runMutator('condition', source).map(formatMutant)).toStrictEqual(
      expected,
    )
  })

  it('forces an awaited test next to the await removal', () => {
    let source = [
      'async function f(id: string) {',
      '  if (await exists(id)) run()',
      '}',
    ].join('\n')

    expect(runMutator('condition', source).map(formatMutant)).toStrictEqual([
      'await exists(id) -> true',
      'await exists(id) -> false',
    ])
    expect(runMutator('missing-await', source).map(formatMutant)).toStrictEqual(
      ['await exists(id) -> exists(id)'],
    )
  })

  it.each<{ body: string }>([
    { body: 'if (a < b) x()' },
    { body: 'if (a && b) y()' },
    { body: 'if (true) z()' },
    { body: 'if (-1) w()' },
    { body: "if (!'') w()" },
    { body: 'if (`text`) w()' },
    { body: 'if (!(a < b)) x()' },
    { body: 'k = !(a || b)' },
    { body: 'k = !a || b' },
    { body: 'k = !(a < b)' },
    { body: 'k = -x' },
  ])('leaves $body to its owner', ({ body }) => {
    expect(runMutator('condition', body)).toStrictEqual([])
  })

  it('leaves a literal test to the literal mutator', () => {
    expect(
      runMutator('boolean-literal', 'if (true) z()').map(formatMutant),
    ).toStrictEqual(['true -> false'])
    expect(runMutator('condition', 'if (true) z()')).toStrictEqual([])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        [
          'for (;;) {',
          '  step()',
          '  if (done()) break',
          '} -> for (;false;) {',
          '  step()',
          '  if (done()) break',
          '}',
        ].join('\n'),
        'done() -> true',
      ],
      source: ['for (;;) {', '  step()', '  if (done()) break', '}'].join('\n'),
    },
    {
      expected: [
        [
          'for (;;) {',
          '  if (ready()) break',
          '  tick()',
          '} -> for (;false;) {',
          '  if (ready()) break',
          '  tick()',
          '}',
        ].join('\n'),
      ],
      source: ['for (;;) {', '  if (ready()) break', '  tick()', '}'].join(
        '\n',
      ),
    },
    {
      expected: [
        [
          'outer: for (;;) {',
          '  if (skip()) continue outer',
          '  if (done()) break',
          '} -> outer: for (;false;) {',
          '  if (skip()) continue outer',
          '  if (done()) break',
          '}',
        ].join('\n'),
        'skip() -> true',
        'skip() -> false',
        'done() -> true',
      ],
      source: [
        'outer: for (;;) {',
        '  if (skip()) continue outer',
        '  if (done()) break',
        '}',
      ].join('\n'),
    },
    {
      expected: [
        'outer: inner: for (;;) work() -> outer: inner: for (;false;) work()',
      ],
      source: 'outer: inner: for (;;) work()',
    },
    {
      expected: [
        [
          'for (;;) {',
          '  if (a || b) break',
          '  step()',
          '} -> for (;false;) {',
          '  if (a || b) break',
          '  step()',
          '}',
        ].join('\n'),
      ],
      source: ['for (;;) {', '  if (a || b) break', '  step()', '}'].join('\n'),
    },
    {
      expected: [
        'for (let i = 0; ; i++) work(i) -> for (let i = 0;false ; i++) work(i)',
      ],
      source: 'for (let i = 0; ; i++) work(i)',
    },
    {
      expected: ['for ( /* ( */ ; ;) work() -> for ( /* ( */ ;false ;) work()'],
      source: 'for ( /* ( */ ; ;) work()',
    },
  ])(
    'forces a loop without a test to never run in $source',
    ({ expected, source }) => {
      expect(runMutator('condition', source).map(formatMutant)).toStrictEqual(
        expected,
      )
    },
  )

  it('reports the never-run mutant as a block', () => {
    expect(runMutator('condition', 'for (;;) work()')).toStrictEqual([
      {
        replacement: 'for (;false;) work()',
        original: 'for (;;) work()',
        mutator: 'condition',
        status: 'Pending',
        kind: 'block',
        reason: null,
        scope: null,
        column: 1,
        line: 1,
      },
    ])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['items.length -> true', 'items.length -> false'],
      source: 'while (items.length) handle(items.shift())',
    },
    {
      source: 'while (true) { step(); if (done()) break }',
      expected: ['done() -> true', 'done() -> false'],
    },
  ])(
    'emits the running value of $source with timeouts',
    ({ expected, source }) => {
      expect(
        runMutator('condition', source, {
          settings: { timeouts: true },
        }).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it('emits the running value in the strict preset', () => {
    expect(
      runMutator('condition', 'while (!done) step()', {
        preset: 'strict',
      }).map(formatMutant),
    ).toStrictEqual(['!done -> true', '!done -> false'])
  })

  it('skips the running value of a negated loop test', () => {
    expect(
      runMutator('condition', 'while (!done) step()').map(formatMutant),
    ).toStrictEqual(['!done -> false'])
  })

  it.each<{ expected: string[]; source: string; file: string }>([
    {
      source: [
        'function f(rows: Row[]) {',
        '  return rows.filter((row) => !row.done)',
        '}',
      ].join('\n'),
      expected: ['!row.done -> true', '!row.done -> false'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(rows: Row[]) {',
        '  return rows.sort((a, b) => !a.done)',
        '}',
      ].join('\n'),
      expected: ['!a.done -> true'],
      file: 'example.ts',
    },
    {
      source: [
        'function f(rows) {',
        '  return rows.filter((r) => {',
        '    if (r.x) return true',
        '    return false',
        '  })',
        '}',
      ].join('\n'),
      expected: ['r.x -> true', 'r.x -> false'],
      file: 'example.js',
    },
    {
      source: [
        'function f(rows) {',
        '  return rows.sort((r) => {',
        '    if (r.x) return 0',
        '    return 1',
        '  })',
        '}',
      ].join('\n'),
      expected: ['r.x -> false'],
      file: 'example.js',
    },
    {
      source: [
        'function f(rows: Row[]) {',
        '  return rows.toSorted((a, b) => !a.done)',
        '}',
      ].join('\n'),
      expected: ['!a.done -> true', '!a.done -> false'],
      file: 'example.ts',
    },
  ])(
    'leaves only the constants that empty a sort comparator to method-call in $source',
    ({ expected, source, file }) => {
      expect(
        runMutator('condition', source, { file }).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ expected: string[]; body: string }>([
    {
      expected: ['enabled ?? false -> false'],
      body: 'if (enabled ?? false) run()',
    },
    {
      expected: ['enabled ?? true -> true'],
      body: 'if (enabled ?? true) run()',
    },
    {
      expected: ['!(enabled ?? false) -> true'],
      body: 'if (!(enabled ?? false)) run()',
    },
    {
      expected: ['value ?? fallback -> true'],
      body: 'if (value ?? fallback) run()',
    },
  ])(
    'skips the constant a directional mutant of $body subsumes',
    ({ expected, body }) => {
      let source = [`function f(${PARAMETERS}) {`, `  ${body}`, '}'].join('\n')

      expect(runMutator('condition', source).map(formatMutant)).toStrictEqual(
        expected,
      )
    },
  )

  it.each<{
    setup: MutatorSetup
    expected: string[]
    situation: string
    lines: string[]
  }>([
    {
      lines: [
        `function f(${PARAMETERS}) {`,
        '  // mootant-ignore-next-line boolean-literal: default is fixed',
        '  if (enabled ?? false) run()',
        '}',
      ],
      expected: ['enabled ?? false -> true', 'enabled ?? false -> false'],
      situation: 'the flip of the default is ignored',
      setup: {},
    },
    {
      lines: [
        `function f(${PARAMETERS}) {`,
        '  if (enabled ?? false) run()',
        '}',
      ],
      expected: ['enabled ?? false -> true', 'enabled ?? false -> false'],
      setup: { mutators: { 'boolean-literal': 'off' } },
      situation: 'boolean-literal is off',
    },
    {
      lines: [
        'function f(value) {',
        '  // mootant-ignore-next-line logical-operator: swap is fixed',
        '  if (value ?? fallback) run()',
        '}',
      ],
      expected: ['value ?? fallback -> true', 'value ?? fallback -> false'],
      situation: 'the drop of the default is ignored',
      setup: {},
    },
    {
      lines: ['function f(value) {', '  if (value ?? fallback) run()', '}'],
      expected: ['value ?? fallback -> true', 'value ?? fallback -> false'],
      setup: { mutators: { 'logical-operator': 'off' } },
      situation: 'logical-operator is off',
    },
  ])(
    'brings back a constant of a nullish test when $situation',
    ({ expected, setup, lines }) => {
      expect(
        runMutator('condition', lines.join('\n'), setup).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; situation: string; lines: string[] }>([
    { lines: ['if (x) notify(x)'], situation: 'it runs', setup: {} },
    {
      lines: [
        '// mootant-ignore-next-line condition: always set',
        'if (x) notify(x)',
      ],
      situation: 'it is ignored',
      setup: {},
    },
    {
      setup: { mutators: { condition: 'off' } },
      lines: ['if (x) notify(x)'],
      situation: 'it is off',
    },
  ])(
    'owns the removal of a whole then-branch while $situation',
    ({ setup, lines }) => {
      expect(
        runMutator('statement-removal', lines.join('\n'), setup),
      ).toStrictEqual([])
    },
  )

  it.each<{
    setup: MutatorSetup
    situation: string
    source: string
    id: string
  }>([
    {
      source: 'x = ok ? true : false',
      id: 'boolean-literal',
      situation: 'it runs',
      setup: {},
    },
    {
      source: [
        '// mootant-ignore-next-line condition: always set',
        'x = ok ? true : false',
      ].join('\n'),
      situation: 'it is ignored',
      id: 'boolean-literal',
      setup: {},
    },
    {
      source: [
        'function f(x: { valid: boolean }): boolean {',
        '  return !x.valid',
        '}',
      ].join('\n'),
      situation: 'it runs',
      id: 'return-value',
      setup: {},
    },
    {
      source: [
        'function f(x: { valid: boolean }): boolean {',
        '  return !x.valid',
        '}',
      ].join('\n'),
      setup: { mutators: { condition: 'off' } },
      situation: 'it is off',
      id: 'return-value',
    },
  ])(
    'owns the forced decision that $id would emit while $situation',
    ({ source, setup, id }) => {
      expect(runMutator(id, source, setup)).toStrictEqual([])
    },
  )

  it.each<{ source: string }>([
    {
      source: ['function f(ok) {', '  return ok ? true : false', '}'].join(
        '\n',
      ),
    },
    {
      source: [
        'function f(ok) {',
        '  const label = ok ? true : false',
        '  return label',
        '}',
      ].join('\n'),
    },
  ])('keeps only its constants for $source', ({ source }) => {
    let file = 'example.js'

    expect(
      runMutator('condition', source, { file }).map(formatMutant),
    ).toStrictEqual(['ok -> true', 'ok -> false'])
    expect(runMutator('boolean-literal', source, { file })).toStrictEqual([])
    expect(runMutator('return-value', source, { file })).toStrictEqual([])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      source: ['declare let s: string', "if (s.includes('x')) run()"].join(
        '\n',
      ),
      expected: ["s.includes('x') -> true", "s.includes('x') -> false"],
    },
    {
      expected: [
        "name.toLowerCase().includes('admin') -> true",
        "name.toLowerCase().includes('admin') -> false",
      ],
      source: [
        'declare let name: string',
        "if (name.toLowerCase().includes('admin')) go()",
      ].join('\n'),
    },
  ])(
    'owns the decision that other mutators leave in $source',
    ({ expected, source }) => {
      expect(runMutator('condition', source).map(formatMutant)).toStrictEqual(
        expected,
      )
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      source: 'function f<T extends {}>(x: T) { if (x) return 1; return 2 }',
      expected: ['x -> true', 'x -> false'],
    },
    {
      source: 'function f(x: Object) { if (x) return 1; return 2 }',
      expected: ['x -> true', 'x -> false'],
    },
    {
      source: 'interface Empty {} function f(x: Empty) { if (x) run() }',
      expected: ['x -> true', 'x -> false'],
    },
    {
      source: 'function f(x: object) { if (x) run() }',
      expected: ['x -> false'],
    },
  ])(
    'keeps the falsy primitives that an empty object type allows in $source',
    ({ expected, source }) => {
      expect(runMutator('condition', source).map(formatMutant)).toStrictEqual(
        expected,
      )
    },
  )

  it.each<[string, string[]]>([
    [
      'function f(flag: boolean, a: number) { if (a > 1) run(); if (!flag && a) run(); if (true) run() }',
      [
        'a > 1 -> true (owned O1)',
        'a > 1 -> false (owned O1)',
        '!flag && a -> true (owned O1)',
        '!flag && a -> false (owned O1)',
        '!flag -> true (owned O3)',
        '!flag -> false (owned O3)',
        'true -> false (owned O7)',
      ],
    ],
    [
      'function f(items: string[]) { if (items) run(); while (ready) step() }',
      [
        'items -> true (equivalent typed-constant)',
        'ready -> true (timeout loop-running)',
      ],
    ],
    [
      'for (;;) { if (done()) break; tick() }',
      ['done() -> true (owned O13)', 'done() -> false (timeout loop-running)'],
    ],
  ])('lists the skipped constants of %s', (source, expected) => {
    expect(listSkipped('condition', source)).toStrictEqual(expected)
  })
})
