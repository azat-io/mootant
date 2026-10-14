import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-mutants'

import { listMutantTexts } from '../../helpers/list-mutant-texts'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

describe('returnValue', () => {
  it.each([
    {
      code: [
        "import type { User } from './user'",
        'function f(u: User): string { return u.name }',
      ].join('\n'),
      expected: ["u.name -> ''"],
    },
    {
      code: 'function f(s: Set<string>): number { return s.size }',
      expected: ['s.size -> 0'],
    },
    {
      code: 'function f(x: unknown): boolean { return check(x) }',
      expected: ['check(x) -> true', 'check(x) -> false'],
    },
    {
      code: 'function f(): string[] { return repo.all() }',
      expected: ['repo.all() -> []'],
    },
    {
      code: 'let f = async (id: string): Promise<number> => { return count(id) }',
      expected: ['count(id) -> 0'],
    },
    {
      code: 'function f(x: unknown): x is string { return test(x) }',
      expected: ['test(x) -> true', 'test(x) -> false'],
    },
    {
      code: 'const onClick = (): void => track()',
      expected: ['track() -> undefined'],
    },
    {
      code: 'function f(a: number, b: number) { const result = compute(a, b); return result }',
      expected: ['result -> undefined'],
    },
    { code: 'function f(): string[] { return [] }', expected: [] },
    {
      expected: ["s.startsWith('#') -> true", "s.startsWith('#') -> false"],
      code: "function f(s: string): boolean { return s.startsWith('#') }",
    },
    {
      code: 'function f(a: number): boolean { const ok = a > 2; return ok }',
      expected: [],
    },
    {
      code: 'function f(x: { valid: boolean }): boolean { return !x.valid }',
      expected: [],
    },
    {
      code: [
        'declare let rows: { visible?: boolean }[]',
        'let a = rows.filter((r) => r.visible ?? false)',
      ].join('\n'),
      expected: ['r.visible ?? false -> false'],
    },
    {
      code: 'async function f(q: string) { const result = await client.search(q); return result.hits }',
      expected: [],
    },
  ])('mutates the TypeScript example $code', ({ expected, code }) => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
  })

  it.each([
    { code: 'function g(x) { return x }', expected: ['x -> undefined'] },
    { expected: ['r.id -> undefined'], code: 'rows.map((r) => r.id)' },
    {
      expected: ['row.name -> true', 'row.name -> false'],
      code: 'rows.filter((row) => row.name)',
    },
    { code: 'rows.sort((a, b) => a.n - b.n)', expected: [] },
    {
      code: 'function h(u) { return u?.name }',
      expected: ['u?.name -> undefined'],
    },
    { code: 'function f(items) { return items[0] }', expected: [] },
    { code: 'function f(s) { return s.trim() }', expected: [] },
    { code: 'function f() { return { a: 1 } }', expected: [] },
    { code: 'function f(a, b) { return a + b }', expected: [] },
    {
      code: 'function f(list) { let sum = 0; for (let x of list) sum += x; return sum }',
      expected: [],
    },
    { code: 'function* g(x) { return x }', expected: [] },
    { code: 'class A { constructor(x) { return x } }', expected: [] },
    { code: 'class A { set v(x) { return x } }', expected: [] },
    { code: 'let o = { set v(x) { return x } }', expected: [] },
  ])('mutates the JavaScript example $code', ({ expected, code }) => {
    expect(
      listMutantTexts('return-value', [code], { file: 'example.js' }),
    ).toStrictEqual(expected)
  })

  it.each([
    'function f() { return 1 }',
    'function f() { return -1 }',
    'function f() { return undefined }',
    'function f() { return void g() }',
    'function f() { return this }',
    'function f() { return function () {} }',
    'function f() { return () => 1 }',
    'function f() { return class {} }',
    'let f = (x) => console.log(x)',
    'let f = (x) => console?.log(x)',
    "function q() { return this.logger?.warn('w') }",
    'return 1',
  ])('does not replace the value of %s', code => {
    expect(
      listMutantTexts('return-value', [code], { file: 'example.cjs' }),
    ).toStrictEqual([])
  })

  it.each([
    'function f(): string[] { return [] as string[] }',
    'function f(): string { return `` }',
    'function f() { const x = null; return x }',
    'const f = (): void => x',
    'const f = (): void => a?.b',
    'async function f(): Promise<void> { return x }',
    'function f(): never { return x }',
    'function f(x: unknown): asserts x { return y }',
  ])('skips a default the value already is in %s', code => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual([])
  })

  it.each([
    {
      code: 'const f = (): void => (a(), b)',
      expected: ['a(), b -> undefined'],
    },
    { code: 'const f = (): void => cb?.()', expected: ['cb?.() -> undefined'] },
    {
      code: 'const f = (): void => delete o.k',
      expected: ['delete o.k -> undefined'],
    },
    {
      code: 'const f = async (): Promise<undefined> => { return go() }',
      expected: ['go() -> undefined'],
    },
    {
      code: 'function f(x: unknown): asserts x { return check(x) }',
      expected: ['check(x) -> undefined'],
    },
  ])('removes the effect of a void result in $code', ({ expected, code }) => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
  })

  it.each([
    {
      code: 'function f(): bigint { return big() }',
      expected: ['big() -> 0n'],
    },
    {
      code: `function f() { return \`\${a}\${b}\` }`,
      expected: [`\`\${a}\${b}\` -> ''`],
    },
    { code: 'function f() { return typeof x }', expected: ["typeof x -> ''"] },
  ])('writes the default of the kind in $code', ({ expected, code }) => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
  })

  it.each([
    {
      expected: ['row.name -> true', 'row.name -> false'],
      code: 'rows.filter((row) => { return row.name })',
    },
    { code: 'rows.sort((a, b) => compare(a, b))', expected: [] },
    {
      code: 'rows.toSorted((a, b) => compare(a, b))',
      expected: ['compare(a, b) -> undefined'],
    },
  ])(
    'leaves only a default that empties a sort comparator to method-call in $code',
    ({ expected, code }) => {
      expect(
        listMutantTexts('return-value', [code], {
          mutators: { 'method-call': 'off' },
          file: 'example.js',
        }),
      ).toStrictEqual(expected)
    },
  )

  it('keeps the default that empties a callback with other statements', () => {
    expect(
      listMutantTexts(
        'return-value',
        ['rows.sort((a, b) => { audit(a); return compare(a, b) })'],
        { file: 'example.js' },
      ),
    ).toStrictEqual(['compare(a, b) -> undefined'])
  })

  it('lists a local without an initializer by its writes', () => {
    expect(
      listMutantTexts(
        'return-value',
        ['function f(s) { let v; v = s.trim(); return v }'],
        {
          file: 'example.js',
        },
      ),
    ).toStrictEqual([])
  })

  it('keeps every default of a callback with several returns', () => {
    expect(
      listMutantTexts(
        'return-value',
        ['rows.filter((row) => { if (row.a) return row.b; return row.c })'],
        { file: 'example.js' },
      ),
    ).toStrictEqual([
      'row.b -> true',
      'row.b -> false',
      'row.c -> true',
      'row.c -> false',
    ])
  })

  it.each<{ setup: MutatorSetup; lines: string[] }>([
    {
      lines: ['function f(a: number): boolean { const ok = a > 2; return ok }'],
      setup: { mutators: { 'comparison-operator': 'off' } },
    },
    {
      lines: [
        'function f(a: number): boolean {',
        '  // mootant-ignore-next-line comparison-operator',
        '  const ok = a > 2',
        '  return ok',
        '}',
      ],
      setup: {},
    },
  ])(
    'brings the boolean constants back without the comparison',
    ({ setup, lines }) => {
      expect(listMutantTexts('return-value', lines, setup)).toStrictEqual([
        'ok -> true',
        'ok -> false',
      ])
    },
  )

  it.each([
    'function f(a: number): boolean { let ok = check(); if (a) ok = a > 2; return ok }',
    'function f(ok: boolean): boolean { const label = ok ? true : false; return label }',
  ])('skips the boolean constants moved through a local in %s', code => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual([])
  })

  it('keeps the boolean constants of a local with a compound write', () => {
    expect(
      listMutantTexts('return-value', [
        'function f(a: number): boolean { let ok = check(); ok ||= a > 2; return ok }',
      ]),
    ).toStrictEqual(['ok -> true', 'ok -> false'])
  })

  it.each<{ setup: MutatorSetup; code: string }>([
    {
      setup: { mutators: { condition: 'off' } },
      code: 'return ok ? true : false',
    },
    {
      code: ['// mootant-ignore-next-line condition', 'return !x.valid'].join(
        '\n',
      ),
      setup: {},
    },
  ])(
    'leaves the constants of $code to the owner of the result',
    ({ setup, code }) => {
      expect(
        listMutantTexts(
          'return-value',
          [
            'function f(ok: boolean, x: { valid: boolean }): boolean {',
            code,
            '}',
          ],
          setup,
        ),
      ).toStrictEqual([])
    },
  )

  it('brings the default of a returned member back without missing-await', () => {
    let source = [
      'async function f(q: string) {',
      '  // mootant-ignore-next-line missing-await',
      '  const result = await client.search(q)',
      '  return result.hits',
      '}',
    ].join('\n')

    expect(runMutator('return-value', source)).toMatchObject([
      { replacement: 'undefined', original: 'result.hits', status: 'Pending' },
    ])
  })

  it('brings the default back while method-call is off', () => {
    expect(
      listMutantTexts('return-value', ['function f(s) { return s.trim() }'], {
        mutators: { 'method-call': 'off' },
        file: 'example.js',
      }),
    ).toStrictEqual(["s.trim() -> ''"])
  })

  it.each([
    {
      code: [
        'declare let s: string',
        'function f() { let v = load(); run(() => { v = s.trim() }); return v }',
      ].join('\n'),
      expected: ['v -> undefined'],
    },
    {
      code: [
        'declare let s: string',
        'function f(c: boolean) { let v = load(); if (c) v = s.trim(); return v }',
      ].join('\n'),
      expected: [],
    },
    {
      code: [
        'declare let s: string',
        'let cache = s.trim()',
        'function f() { return cache }',
      ].join('\n'),
      expected: ["cache -> ''"],
    },
    {
      code: [
        'declare let s: string',
        'function f(x = s.trim()) { return x }',
      ].join('\n'),
      expected: ["x -> ''"],
    },
  ])(
    'limits the solitary ranges to the function in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: [
        'declare const VERSION: string',
        'export function v() { return VERSION }',
      ].join('\n'),
      expected: ["VERSION -> ''"],
    },
    {
      code: [
        'declare const cfg: { url: string }',
        'export function u() { return cfg.url }',
      ].join('\n'),
      expected: ['cfg.url -> undefined'],
    },
    {
      code: 'function run(ts: (() => void)[]) { let done = 0; for (const t of ts) { t(); console.log(++done) } return done }',
      expected: [],
    },
    {
      code: 'function k(a: number) { let ok = false; console.log((ok = a > 1)); return ok }',
      expected: ['ok -> false'],
    },
  ])(
    'leaves names and writes outside the runtime tree out in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[]; lines: string[] }>([
    {
      lines: [
        'function total(xs) {',
        '  let sum = 0',
        '  for (const x of xs) sum += x',
        '  return sum',
        '}',
      ],
      setup: {
        mutators: { 'assignment-operator': 'off', 'number-literal': 'off' },
        file: 'example.js',
      },
      expected: [],
    },
    {
      lines: [
        'function total(xs) {',
        '  let sum = 0',
        '  // mootant-ignore-next-line statement-removal',
        '  for (const x of xs) sum += x',
        '  return sum',
        '}',
      ],
      setup: {
        mutators: { 'assignment-operator': 'off', 'number-literal': 'off' },
        file: 'example.js',
      },
      expected: ['sum -> 0'],
    },
    {
      setup: {
        mutators: {
          'assignment-operator': 'off',
          'statement-removal': 'off',
          'number-literal': 'off',
        },
        file: 'example.js',
      },
      lines: [
        'function total(xs) {',
        '  let sum = 0',
        '  for (const x of xs) sum += x',
        '  return sum',
        '}',
      ],
      expected: ['sum -> 0'],
    },
  ])(
    'decides the removal of a write before the returned local in $lines',
    ({ expected, setup, lines }) => {
      expect(listMutantTexts('return-value', lines, setup)).toStrictEqual(
        expected,
      )
    },
  )

  it.each<{ setup: MutatorSetup; expected: string[] }>([
    { setup: { file: 'example.js' }, expected: [] },
    {
      setup: { mutators: { 'missing-await': 'off' }, file: 'example.js' },
      expected: ['r.hits -> undefined'],
    },
  ])(
    'counts the initializer of a returned member chain with $setup',
    ({ expected, setup }) => {
      let lines = [
        'async function f() {',
        '  const r = await load()',
        '  return r.hits',
        '}',
      ]

      expect(listMutantTexts('return-value', lines, setup)).toStrictEqual(
        expected,
      )
    },
  )

  it.each<[string, string[]]>([
    [
      'function f(): void { return x }',
      ['x -> undefined (equivalent void-result)'],
    ],
    [
      'function f() { return console.log(x) }',
      ['console.log(x) -> undefined (noise logging-call)'],
    ],
    ['items.sort((a: number, b: number) => a - b)', ['a - b -> 0 (owned O12)']],
    [
      'items.sort(() => x > y)',
      ['x > y -> true (subsumed R6)', 'x > y -> false (owned O12)'],
    ],
    ['function f() { return x }', []],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('return-value', source)).toStrictEqual(expected)
  })
})
