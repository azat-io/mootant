import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { listMutantTexts } from '../../helpers/list-mutant-texts'
import { generateMutants } from '../../helpers/generate-mutants'
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
    `async function f(): Promise<void> { return \`\${x}\` }`,
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

  it('counts the string initializer of a returned local', () => {
    let source = "function f(): string { let label = 'abc'; return label }"

    expect(listMutantTexts('return-value', [source])).toStrictEqual([])
    expect(listSkipped('return-value', source)).toStrictEqual([
      "label -> '' (subsumed solitary)",
    ])
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

  it.each([
    {
      code: [
        'class Loader {',
        '  loading: Promise<void>',
        '  whenReady(): Promise<void> { return this.loading }',
        '}',
      ].join('\n'),
      expected: ['this.loading -> Promise.resolve(void 0)'],
    },
    {
      code: [
        'let pending: Promise<void> = Promise.resolve()',
        'function queue(task: () => Promise<void>): Promise<void> {',
        '  pending = pending.then(task)',
        '  return pending',
        '}',
      ].join('\n'),
      expected: ['pending -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<void> { return run() }',
      expected: ['run() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(e: Error): Promise<void> { return Promise.reject(e) }',
      expected: ['Promise.reject(e) -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<undefined> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(undefined: unknown): Promise<undefined> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<User | undefined> { return find() }',
      expected: ['find() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<never> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(id: string): Promise<string> { return load(id) }',
      expected: ["load(id) -> Promise.resolve('')"],
    },
    {
      code: 'let f = (): Promise<number> => count()',
      expected: ['count() -> Promise.resolve(0)'],
    },
    {
      code: 'function f(): Promise<bigint> { return big() }',
      expected: ['big() -> Promise.resolve(0n)'],
    },
    {
      code: 'function f(): Promise<string[]> { return all() }',
      expected: ['all() -> Promise.resolve([])'],
    },
    {
      expected: [
        'check() -> Promise.resolve(true)',
        'check() -> Promise.resolve(false)',
      ],
      code: 'class A { has(): Promise<boolean> { return check() } }',
    },
    {
      code: [
        "import type { Response } from './response'",
        'function f(): Promise<Response> { return send() }',
      ].join('\n'),
      expected: ['send() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<() => void> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<{ id: string }> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<null> { return load() }',
      expected: ['load() -> Promise.resolve(null)'],
    },
    {
      code: 'function f(): Promise<User | null> { return find() }',
      expected: ['find() -> Promise.resolve(null)'],
    },
    {
      code: [
        "import type { User } from './user'",
        'type Result = User | null',
        'function f(pending: Promise<Result>): Promise<Result> {',
        '  return pending',
        '}',
      ].join('\n'),
      expected: ['pending -> Promise.resolve(null)'],
    },
    {
      code: 'function f(): Promise<string | null> { return find() }',
      expected: ["find() -> Promise.resolve('')"],
    },
    {
      code: [
        'type Done = void',
        'function f(pending: Promise<Done>): Promise<Done> { return pending }',
      ].join('\n'),
      expected: ['pending -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<void | undefined> { return load() }',
      expected: ['load() -> Promise.resolve(void 0)'],
    },
    {
      code: 'rows.filter((row): Promise<boolean> => row.allowed)',
      expected: ['row.allowed -> true', 'row.allowed -> false'],
    },
  ])(
    'writes a resolved promise for a Promise<T> function without async in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: 'function f(): Promise<void> { return Promise.resolve() }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return Promise.resolve(undefined) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return Promise.resolve(void 0) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return (Promise.resolve<void>()) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return (Promise as PromiseConstructor).resolve() }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return (Promise)!.resolve() }',
      expected: [],
    },
    {
      code: 'function f(): Promise<undefined> { return Promise.resolve(undefined) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<undefined> { return Promise.resolve() }',
      expected: [],
    },
    {
      code: 'function f(): Promise<string> { return Promise.resolve("") }',
      expected: [],
    },
    {
      code: 'function f(): Promise<number> { return Promise.resolve(0) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<bigint> { return Promise.resolve(0n) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<number[]> { return Promise.resolve([]) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<null> { return Promise.resolve(null) }',
      expected: [],
    },
    {
      code: 'function f(): Promise<void> { return Promise.resolve(null) }',
      expected: ['Promise.resolve(null) -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<null> { return Promise.resolve(x) }',
      expected: ['Promise.resolve(x) -> Promise.resolve(null)'],
    },
    {
      code: 'function f(): Promise<void> { return Promise.resolve(void run()) }',
      expected: ['Promise.resolve(void run()) -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(undefined: void): Promise<void> { return Promise.resolve(undefined) }',
      expected: ['Promise.resolve(undefined) -> Promise.resolve(void 0)'],
    },
    {
      expected: [
        'Promise.resolve(undefined, run()) -> Promise.resolve(void 0)',
      ],
      code: 'function f(): Promise<void> { return Promise.resolve(undefined, run()) }',
    },
    {
      code: 'function f(xs: []): Promise<void> { return Promise.resolve(...xs) }',
      expected: ['Promise.resolve(...xs) -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<void> { return Promise.all(tasks).then(done) }',
      expected: ['Promise.all(tasks).then(done) -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<void> { return P.resolve() }',
      expected: ['P.resolve() -> Promise.resolve(void 0)'],
    },
    {
      code: 'function f(): Promise<void> { return Promise.reject() }',
      expected: ['Promise.reject() -> Promise.resolve(void 0)'],
    },
  ])(
    'leaves out only the promise default the value already is in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each([
    [
      'function f(): Promise<boolean> { return Promise.resolve(true) }',
      ['Promise.resolve(true) -> Promise.resolve(false) (subsumed solitary)'],
    ],
    [
      'function f(): Promise<number> { return Promise.resolve(-0) }',
      ['Promise.resolve(-0) -> Promise.resolve(0) (subsumed solitary)'],
    ],
    [
      'function f(): Promise<number[]> { return Promise.resolve([1]) }',
      ['Promise.resolve([1]) -> Promise.resolve([]) (subsumed solitary)'],
    ],
    [
      "function f(): Promise<void> { return Promise['resolve']() }",
      ["Promise['resolve']() -> Promise.resolve(void 0) (subsumed solitary)"],
    ],
  ])(
    'keeps every other promise default as a candidate in %s',
    (source, expected) => {
      expect(listSkipped('return-value', source)).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: [
        'type Promise<T> = { then(next: (value: T) => void): void }',
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'a type of the file',
    },
    {
      code: [
        'interface Promise<T> { then(next: (value: T) => void): void }',
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'an interface of the file',
    },
    {
      code: 'function f<Promise>(): Promise { return load() }',
      title: 'a type parameter',
    },
    {
      code: [
        "import { Promise } from 'bluebird'",
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'an import',
    },
    {
      code: [
        "import type { Promise } from 'bluebird'",
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'a type-only import',
    },
    {
      code: [
        "import type Promise = require('bluebird')",
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'a type-only import assignment',
    },
    {
      code: [
        'let Promise = globalThis.Promise',
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'a value of the file',
    },
    {
      code: [
        'namespace N { export let x = 1 }',
        'function f(): Promise<void> { return load() }',
      ].join('\n'),
      title: 'an opaque program',
    },
    {
      code: 'function f(): globalThis.Promise<void> { return load() }',
      title: 'a qualified name',
    },
    {
      code: [
        '<script lang="ts">',
        'const Promise = globalThis.Promise',
        'export default {}',
        '</script>',
        '<script setup lang="ts">',
        'function f(): Promise<void> { return load() }',
        '</script>',
      ].join('\n'),
      title: 'another script block of a component',
      file: 'Shadow.vue',
    },
  ])(
    'keeps the old default when $title may stand for Promise',
    ({ file = 'example.ts', code }) => {
      expect(
        generateMutants(code, { file })
          .filter(mutant => mutant.mutator === 'return-value')
          .map(mutant => mutant.replacement),
      ).toStrictEqual(['undefined'])
    },
  )

  it('keeps the old default of a Promise in JavaScript', () => {
    expect(
      listMutantTexts(
        'return-value',
        ['function f() { return Promise.resolve() }'],
        { file: 'example.js' },
      ),
    ).toStrictEqual(['Promise.resolve() -> undefined'])
  })

  it.each<{ setup: MutatorSetup; expected: string[] }>([
    { expected: [], setup: {} },
    {
      expected: [
        'check(s.trim()) -> Promise.resolve(true)',
        'check(s.trim()) -> Promise.resolve(false)',
      ],
      setup: { mutators: { 'method-call': 'off' } },
    },
  ])(
    'makes the promise of boolean constants solitary with $setup',
    ({ expected, setup }) => {
      expect(
        listMutantTexts(
          'return-value',
          [
            'function f(s: string): Promise<boolean> { return check(s.trim()) }',
          ],
          setup,
        ),
      ).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: [
        'class Loader {',
        '  loading: Promise<void>',
        '  async whenReady(): Promise<void> { return this.loading }',
        '}',
      ].join('\n'),
      expected: ['this.loading -> undefined'],
    },
    {
      code: 'async function f(): Promise<void> { return x }',
      expected: ['x -> undefined'],
    },
    {
      code: 'let f = async (): Promise<undefined> => store.ready',
      expected: ['store.ready -> undefined'],
    },
  ])(
    'removes a returned thenable of an async void result in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: 'async function f(): Promise<void> { return a + b }',
      expected: 'a + b -> undefined (equivalent void-result)',
    },
    {
      expected: '!a -> undefined (equivalent void-result)',
      code: 'async function f(): Promise { return !a }',
    },
    {
      expected: `\`\${a}\` -> undefined (equivalent void-result)`,
      code: `let f = async (): Promise<void> => \`\${a}\``,
    },
  ])(
    'skips the default of an async void result that is never a thenable in $code',
    ({ expected, code }) => {
      expect(listSkipped('return-value', code)).toStrictEqual([expected])
    },
  )

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
    'function f(a: number, c: boolean): boolean { let ok = check(); if (c) (ok as boolean) = a > 2; return ok }',
    'function f(a: number, items: number[]): boolean { let ok = a > 2; items.forEach(() => { ok = false }); return ok }',
    'function f(a: number, b: number, log: (ok: boolean) => void): boolean { let ok = a > 2; if (b) log((ok = b > 1)); return ok }',
    'function f(c: boolean, pair: [boolean, number], a: number, report: (n: number) => void): boolean { let [ok, n] = pair; if (c) ok = a > 2; report(n); return ok }',
  ])('skips the boolean constants moved through a local in %s', code => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual([])
  })

  it('skips the boolean constants of a returned local that only the return reads', () => {
    let source =
      'function f(a: number, b: boolean): boolean { let ok = a > 0 && b; return ok }'

    expect(listMutantTexts('return-value', [source])).toStrictEqual([])
    expect(listSkipped('return-value', source)).toStrictEqual([
      'ok -> true (subsumed R6)',
      'ok -> false (subsumed R6)',
    ])
  })

  it('keeps the boolean constants of a local with a compound write', () => {
    expect(
      listMutantTexts('return-value', [
        'function f(a: number): boolean { let ok = check(); ok ||= a > 2; return ok }',
      ]),
    ).toStrictEqual(['ok -> true', 'ok -> false'])
  })

  it('keeps the boolean constants of a returned local that a branch also reads', () => {
    let lines = [
      'export function validate(input, report) {',
      '  let ok = input.length > 2 && input.length < 10',
      '  if (!ok) {',
      "    report('invalid')",
      '  }',
      '  return ok',
      '}',
    ]

    expect(
      listMutantTexts('return-value', lines, { file: 'example.js' }),
    ).toStrictEqual(['ok -> true', 'ok -> false'])
    expect(
      listSkipped('return-value', lines.join('\n'), { file: 'example.js' }),
    ).toStrictEqual([])
  })

  it.each([
    {
      code: 'function f(a: number, notify: (ok: boolean) => void): boolean { let ok = a > 2; notify(ok); return ok }',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: 'function f(a: number, report: () => void): boolean { let ok: boolean; ok = a > 2; if (!ok) report(); return ok }',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: 'function f(a: number, items: number[], use: (item: number, ok: boolean) => void): boolean { let ok = a > 2; items.forEach(item => { use(item, ok) }); return ok }',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: 'function f(a: number, b: boolean): boolean { let ok = a > 2; if (b) return ok; return ok }',
      expected: ['ok -> true', 'ok -> false', 'ok -> true', 'ok -> false'],
    },
    {
      code: 'function f(a: number): boolean { let ok = a > 2; console.log(ok); return ok }',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: 'function f(a: number, report: () => void): boolean { let ok: boolean; if ((ok = a > 2)) report(); return ok }',
      expected: ['ok -> true', 'ok -> false'],
    },
  ])(
    'keeps the boolean constants of a returned local that other code reads in $code',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: 'function f(a: number, save: () => boolean): boolean { let ok = a > 2; ok &&= save(); return ok }',
      title: 'the target of a logical assignment',
    },
    {
      code: 'function f(a: number): boolean { let ok = false; [ok] = [a > 2]; return ok }',
      title: 'a destructuring write',
    },
    {
      code: [
        'declare function dec(value: unknown): any',
        'function k(a: number): boolean { let ok = a > 1; class A { @dec(ok) m() {} } return ok }',
      ].join('\n'),
      title: 'a reference outside the runtime tree',
    },
    {
      code: 'function f(a: number, b: boolean): boolean { let ok = a > 2; if (b) ok = !ok; return ok }',
      title: 'the value of its own write',
    },
  ])('counts $title as a read of a returned boolean local', ({ code }) => {
    expect(listMutantTexts('return-value', [code])).toStrictEqual([
      'ok -> true',
      'ok -> false',
    ])
  })

  it.each([
    {
      code: 'function k(a: number) { let ok = false; console.log((ok = a > 1)); return ok }',
      title: 'a write whose value other code reads',
      expected: ['ok -> false'],
    },
    {
      code: 'function f(a: number, use: (other: boolean) => void): boolean { let other: boolean; let ok = other = a > 2; use(other); return ok }',
      title: 'an initializer that is itself an assignment',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: "function f(items: boolean[][], c: boolean, report: (v: unknown) => void) { return items.filter(item => { let [ok, second] = c ? '' : item; report(second); return ok }) }",
      title: 'the initializer of a destructuring pattern',
      expected: ['ok -> true', 'ok -> false'],
    },
    {
      code: "function f(items: boolean[][], c: boolean) { return items.filter(item => { let [ok] = c ? '' : item; return ok }) }",
      title: 'the initializer of a destructuring pattern with one name',
      expected: ['ok -> true', 'ok -> false'],
    },
  ])(
    'does not count $title as a source of a returned boolean local',
    ({ expected, code }) => {
      expect(listMutantTexts('return-value', [code])).toStrictEqual(expected)
    },
  )

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
      code: [
        'declare function dec(value: unknown): any',
        'function k(a: number): boolean { let ok = false; class A { @dec((ok = a > 1)) m() {} } return ok }',
      ].join('\n'),
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

  it('keeps the default of a returned local that a callback also reads', () => {
    let lines = [
      'export function processAll(items, onItem) {',
      '  let count = 0',
      '  for (let item of items) {',
      '    count++',
      '    onItem(item, count)',
      '  }',
      '  return count',
      '}',
    ]

    expect(
      listMutantTexts('return-value', lines, { file: 'example.js' }),
    ).toStrictEqual(['count -> 0'])
    expect(
      listSkipped('return-value', lines.join('\n'), { file: 'example.js' }),
    ).toStrictEqual([])
  })

  it.each<{ expected: string[]; file?: string; code: string }>([
    {
      code: 'function f(items, onItem) { let count = 0; for (let item of items) onItem(item, ++count); return count }',
      expected: ['count -> 0'],
    },
    {
      code: 'function f(items, onItem) { let count = 0; items.forEach(item => { count++; onItem(item, count) }); return count }',
      expected: ['count -> 0'],
    },
    {
      code: 'function f(items, flag) { let count = 0; for (let item of items) count++; if (flag) return count; return count }',
      expected: ['count -> 0', 'count -> 0'],
    },
    {
      code: 'function f(items, onMany) { let count = 0; for (let item of items) count++; if (count > 9) onMany(); return count }',
      expected: ['count -> 0'],
    },
    {
      code: 'function f(items, box) { let count = 0; for (let item of items) count++; box.total = count; return count }',
      expected: ['count -> 0'],
    },
    {
      code: 'function run(ts: (() => void)[]) { let done = 0; for (const t of ts) { t(); console.log(++done) } return done }',
      expected: ['done -> 0'],
      file: 'example.ts',
    },
    {
      code: 'async function f(onItem) { const r = await load(); onItem(r); return r.hits }',
      expected: ['r.hits -> undefined'],
    },
    {
      code: "async function f() { let path = './plugin.js'; await import(path); return path }",
      expected: ["path -> ''"],
    },
    {
      code: "function f(items, onItem) { let last = ''; for (let item of items) onItem((last = item.name.trim())); return last }",
      expected: ["last -> ''"],
    },
    {
      code: 'function f(items, warn) { let count = 0; for (let item of items) count++; count ||= warn(); return count }',
      expected: ['count -> undefined'],
    },
    {
      code: 'function f(groups, key, x) { let list = groups.get(key) ?? []; list.push(x); return list }',
      expected: ['list -> undefined'],
    },
  ])(
    'keeps the default of a returned local that other code reads in $code',
    ({ file = 'example.js', expected, code }) => {
      expect(listMutantTexts('return-value', [code], { file })).toStrictEqual(
        expected,
      )
    },
  )

  it.each([
    {
      code: 'async function f(api, id) { let { data, error } = await api.get(id); if (error) throw error; return data }',
      expected: ['data -> undefined'],
    },
    {
      code: 'async function f() { let [first] = await load(); return first }',
      expected: ['first -> undefined'],
    },
  ])(
    'keeps the default of a returned local that a destructuring pattern declares in $code',
    ({ expected, code }) => {
      expect(
        listMutantTexts('return-value', [code], { file: 'example.js' }),
      ).toStrictEqual(expected)
    },
  )

  it.each([
    {
      code: 'function f(xs) { let paths = []; let size = 0; for (let x of xs) size = paths.push(x); return paths }',
      title: 'a push whose result is used',
      expected: ['paths -> []'],
    },
    {
      code: 'function f(xs, reset) { let paths = []; if (reset) paths = []; for (let x of xs) paths.push(x); return paths }',
      title: 'a push into a local that is also written',
      expected: ['paths -> []'],
    },
    {
      code: "function f(xs) { let paths = []; for (let x of xs) paths['push'](x); return paths }",
      expected: ['paths -> []'],
      title: 'a computed push',
    },
    {
      code: 'function f(xs) { let paths = []; for (let x of xs) paths.splice(0, 0, x); return paths }',
      title: 'another call on the local',
      expected: ['paths -> []'],
    },
    {
      code: 'function f(xs, run) { let paths = []; run(paths.push); return paths }',
      title: 'a push that is not called',
      expected: ['paths -> []'],
    },
    {
      code: "function f(name) { let label = name.trim(); label ||= 'anon'; return label }",
      title: 'the target of a logical assignment',
      expected: ["label -> ''"],
    },
    {
      code: "function f(text) { let node = document.createElement('li'); node.textContent = text; return node }",
      expected: ['node -> undefined'],
      title: 'a write of its member',
    },
    {
      code: 'function f(xs) { let sum = 0; for (let x of xs) sum = sum + x; return sum }',
      title: 'the value of its own write',
      expected: ['sum -> undefined'],
    },
    {
      code: 'function f(items) { let count = 0; items.forEach(() => count++); return count }',
      title: 'a write that a forEach callback returns',
      expected: ['count -> 0'],
    },
  ])('counts $title as a read of a returned local', ({ expected, code }) => {
    expect(
      listMutantTexts('return-value', [code], { file: 'example.js' }),
    ).toStrictEqual(expected)
  })

  it.each([
    'function f(xs) { let count = 0; for (let x of xs) count++; return count }',
    'function f(items) { let count = 0; items.forEach(item => { count += item }); return count }',
  ])(
    'skips the default of a returned local that other code only writes in %s',
    code => {
      expect(
        listSkipped('return-value', code, { file: 'example.js' }),
      ).toStrictEqual(['count -> 0 (subsumed solitary)'])
    },
  )

  it.each([
    'function f(xs) { let paths = []; for (let x of xs) paths.push(x); return paths }',
    'function f(xs) { let paths = []; xs.forEach(x => { (paths).unshift(x) }); return paths }',
    'function f(xs) { let paths = /** @type {string[]} */ ([]); for (let x of xs) paths.push(x); return paths }',
  ])(
    'skips the default of a returned local that other code only fills in %s',
    code => {
      expect(
        listSkipped('return-value', code, { file: 'example.js' }),
      ).toStrictEqual(['paths -> [] (subsumed solitary)'])
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
    [
      "function f(sku: string): boolean { return typeof sku === 'string' }",
      [
        "typeof sku === 'string' -> true (equivalent proven-comparison)",
        "typeof sku === 'string' -> false (owned O19)",
      ],
    ],
    [
      "(sku: string): boolean => !(typeof sku === 'string')",
      [
        "!(typeof sku === 'string') -> true (owned O19)",
        "!(typeof sku === 'string') -> false (equivalent proven-comparison)",
      ],
    ],
    [
      'function f(items: string[]): boolean { return items.length >= 0 }',
      [
        'items.length >= 0 -> true (equivalent lower-bound)',
        'items.length >= 0 -> false (subsumed R6)',
      ],
    ],
    ['function f() { return x }', []],
    ['function f(): Promise<void> { return Promise.resolve() }', []],
    [
      'function f(): Promise<void> { return console.log(x) }',
      ['console.log(x) -> Promise.resolve(void 0) (noise logging-call)'],
    ],
    [
      'items.sort((a: number, b: number): Promise<number> => compare(a, b))',
      ['compare(a, b) -> Promise.resolve(0) (owned O12)'],
    ],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('return-value', source)).toStrictEqual(expected)
  })
})
