import { describe, expect, it } from 'vitest'

import { listMutantTexts } from '../../helpers/list-mutant-texts'
import { listSkipped } from '../../helpers/list-skipped'

/**
 * Declarations of the catalog's examples for method-call.
 */
const DECLARATIONS = [
  'interface Query { filter(f: unknown): Query }',
  'declare let name: string',
  'declare let s: string',
  'declare let items: number[]',
  'declare let query: Query',
  'declare function isEven(n: number): boolean',
]

describe('methodCall', () => {
  it.each([
    {
      expected: [
        'name.trim().toLowerCase() -> name.trim().toUpperCase()',
        'name.trim() -> name',
      ],
      code: 'let a = name.trim().toLowerCase()',
    },
    {
      expected: [
        'items.filter(isEven).sort() -> items.filter(isEven)',
        'items.filter(isEven) -> items',
      ],
      code: 'let a = items.filter(isEven).sort()',
    },
    { code: 'let a = query.filter(isEven)', expected: [] },
    {
      expected: ['Math.max(items.length, 1) -> Math.min(items.length, 1)'],
      code: 'let a = Math.max(items.length, 1)',
    },
    {
      expected: [
        "s.startsWith('#') -> s.endsWith('#')",
        'items.every(isEven) -> items.some(isEven)',
      ],
      code: "let a = s.startsWith('#') && items.every(isEven)",
    },
    { expected: ['items.slice() -> items'], code: 'let a = items.slice()' },
    { code: 'let a = s.slice(0)', expected: [] },
    { code: 'let a = s.substring(0)', expected: [] },
    { expected: ['s.slice(1) -> s'], code: 'let a = s.slice(1)' },
    { code: 'if (s.toUpperCase()) go()', expected: [] },
    { code: 'if (s.trimEnd()) go()', expected: [] },
    { code: 'let a = name.padStart(8).length', expected: [] },
    {
      expected: ['name.toUpperCase() -> name.toLowerCase()'],
      code: 'let a = name.toUpperCase().length',
    },
    {
      expected: [
        'items.slice().sort() -> items.slice()',
        'items.slice() -> items',
      ],
      code: 'let a = items.slice().sort()',
    },
    {
      expected: ['name.trimStart() -> name.trimEnd()'],
      code: 'let a = name.trimStart().length',
    },
  ])('mutates the catalog example $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [...DECLARATIONS, code]),
    ).toStrictEqual(expected)
  })

  it.each([
    "let a = answer.toLowerCase() === 'yes'",
    "let a = method.toUpperCase() !== 'GET'",
    "if (name.toLowerCase().includes('admin')) go()",
    "let a = code.toLowerCase() === '404'",
  ])('skips a case swap decided by a literal in %s', code => {
    expect(
      listMutantTexts('method-call', [
        'declare let answer: string',
        'declare let method: string',
        'declare let code: string',
        ...DECLARATIONS,
        code,
      ]),
    ).toStrictEqual([])
  })

  it('swaps only the lookup of a case-changed file name in a test', () => {
    expect(
      listMutantTexts('method-call', [
        'declare let file: string',
        "if (file.toLowerCase().endsWith('.md')) go()",
      ]),
    ).toStrictEqual([
      "file.toLowerCase().endsWith('.md') -> file.toLowerCase().startsWith('.md')",
    ])
  })

  it('keeps the case swap of a lookup in a value position', () => {
    expect(
      listMutantTexts('method-call', [
        ...DECLARATIONS,
        "const isAdmin = name.toLowerCase().includes('admin')",
      ]),
    ).toStrictEqual(['name.toLowerCase() -> name.toUpperCase()'])
  })

  it.each([
    {
      expected: [
        'value?.trim().toLowerCase() -> value?.trim().toUpperCase()',
        'value?.trim().toLowerCase() -> value?.toLowerCase()',
      ],
      code: 'let a = value?.trim().toLowerCase()',
    },
    {
      expected: ['user?.name.trim() -> user?.name'],
      code: 'let a = user?.name.trim()',
    },
    {
      expected: ['list?.filter(isEven).length -> list?.length'],
      code: 'let a = list?.filter(isEven).length',
    },
    {
      expected: [
        'items?.filter(isEven).sort() -> items?.filter(isEven)',
        'items?.filter(isEven).sort() -> items?.sort()',
      ],
      code: 'let a = items?.filter(isEven).sort()',
    },
    {
      expected: [
        'value?.trim()!.toLowerCase() -> value?.trim()!.toUpperCase()',
        'value?.trim()!.toLowerCase() -> value!?.toLowerCase()',
      ],
      code: 'let a = value?.trim()!.toLowerCase()',
    },
  ])('edits the chain root of $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [
        'declare let value: string | undefined',
        'declare let user: { name: string } | undefined',
        'declare let list: number[] | undefined',
        ...DECLARATIONS,
        code,
      ]),
    ).toStrictEqual(expected)
  })

  it('removes the filter in plain JavaScript', () => {
    expect(
      listMutantTexts(
        'method-call',
        ['let a = list.filter(Boolean).length > 0'],
        {
          file: 'example.js',
        },
      ),
    ).toStrictEqual(['list.filter(Boolean) -> list'])
  })

  it('mutates receivers of any type with the strict preset', () => {
    expect(
      listMutantTexts(
        'method-call',
        [...DECLARATIONS, 'let a = query.filter(isEven)'],
        {
          preset: 'strict',
        },
      ),
    ).toStrictEqual(['query.filter(isEven) -> query'])
  })

  it.each([
    { expected: ['v?.trim()![0] -> v!?.[0]'], code: 'let a = v?.trim()![0]' },
    { expected: ['v?.trim()!() -> v!?.()'], code: 'let a = v?.trim()!()' },
    { expected: ['v?.trim()! -> v!'], code: 'let a = v?.trim()!' },
    { expected: ['v?.trim() -> v'], code: 'let a = v?.trim()' },
    { expected: ['v.trim?.() -> v'], code: 'let a = v.trim?.()' },
    {
      expected: ['v?.trim()?.length -> v?.length'],
      code: 'let a = v?.trim()?.length',
    },
    {
      expected: ['list?.filter(f)[0] -> list?.[0]'],
      code: 'let a = list?.filter(f)[0]',
    },
    { code: 'let a = s.trim()?.length', expected: ['s.trim() -> s'] },
  ])('moves the optional link of $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [
        'declare let v: string | undefined',
        'declare let list: number[] | undefined',
        'declare let s: string',
        'declare function f(n: number): boolean',
        code,
      ]),
    ).toStrictEqual(expected)
  })

  it.each(['delete s.trim()', 'delete s?.trim()'])(
    'skips a call that no switch can wrap in %s',
    code => {
      expect(
        listMutantTexts('method-call', ['declare let s: string', code]),
      ).toStrictEqual([])
    },
  )

  it.each([
    { code: 'let a = s.substring()', expected: [] },
    { code: 'let a = s.substr()', expected: [] },
    { code: 'let a = s.substr(0)', expected: [] },
    { code: 'let a = s.slice(0, undefined)', expected: [] },
    { code: 'let a = s.substr(0, undefined)', expected: [] },
    { code: 'let a = s.slice(0, (s).length)', expected: [] },
    { code: 'let a = (s).substring(0, s.length)', expected: [] },
    { code: 'let a = s.substr(0, s.length)', expected: [] },
    {
      expected: ['items.slice(0, items.length) -> items'],
      code: 'let a = items.slice(0, items.length)',
    },
    { expected: ['s.slice(0, 3) -> s'], code: 'let a = s.slice(0, 3)' },
    {
      expected: ['s.slice(0, 1, 2) -> s'],
      code: 'let a = s.slice(0, 1, 2)',
    },
    {
      expected: ['s.slice(0, name.length) -> s'],
      code: 'let a = s.slice(0, name.length)',
    },
    {
      expected: ['s.slice(0, s[key]) -> s'],
      code: 'let a = s.slice(0, s[key])',
    },
    {
      expected: ['s.slice(0, s.size) -> s'],
      code: 'let a = s.slice(0, s.size)',
    },
    {
      code: 'function f(undefined) { return s.slice(0, undefined) }',
      expected: ['s.slice(0, undefined) -> s'],
    },
  ])('decides the identity of $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [
        ...DECLARATIONS,
        'declare let key: number',
        code,
      ]),
    ).toStrictEqual(expected)
  })

  it.each([
    "let a = items.length > 1 && s.toLowerCase().includes('a')",
    "function f(): boolean { return s.toLowerCase().includes('a') }",
    "function f(): boolean { const ok = s.toLowerCase().includes('a'); return ok }",
    "if (v?.toLowerCase().includes('a')) go()",
    "let a = s.toLocaleUpperCase() == 'A'",
    "let a = 'yes' !== s.toLowerCase()",
  ])('skips a case swap decided by a literal lookup in %s', code => {
    expect(
      listMutantTexts('method-call', [
        'declare let v: string | undefined',
        ...DECLARATIONS,
        code,
      ]),
    ).toStrictEqual([])
  })

  it.each([
    {
      expected: [
        "s.toLowerCase().startsWith('!') -> s.toLowerCase().endsWith('!')",
      ],
      code: "if (s.toLowerCase().startsWith('!')) go()",
    },
    {
      expected: [
        "s.toUpperCase().endsWith('!') -> s.toUpperCase().startsWith('!')",
      ],
      code: "if (s.toUpperCase().endsWith('!')) go()",
    },
  ])(
    'skips the case swap under a position-free lookup in $code',
    ({ expected, code }) => {
      expect(
        listMutantTexts('method-call', [...DECLARATIONS, code]),
      ).toStrictEqual(expected)
    },
  )

  it.each([
    {
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
      code: "let a = s.toLowerCase() + 'a'",
    },
    {
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
      code: "let a = s.toLowerCase() === 'A'",
    },
    {
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
      code: 'let a = s.toLowerCase()[0]',
    },
    {
      expected: [
        's.toLowerCase().trim() -> s.toLowerCase()',
        's.toLowerCase() -> s.toUpperCase()',
      ],
      code: 'let a = s.toLowerCase().trim()',
    },
    {
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
      code: 'let a = f(s.toLowerCase().includes)',
    },
    {
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
      code: 'if (s.toLowerCase().includes()) go()',
    },
    {
      code: "if (s.toLowerCase().includes('Admin')) go()",
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
    },
    {
      code: "let a = s.toUpperCase().indexOf('!') === 2",
      expected: ['s.toUpperCase() -> s.toLowerCase()'],
    },
    {
      code: "if (s.toLowerCase().indexOf('a') === -1) go()",
      expected: ['s.toLowerCase() -> s.toUpperCase()'],
    },
    {
      code: "let a = s.toUpperCase().lastIndexOf('!') > 0",
      expected: ['s.toUpperCase() -> s.toLowerCase()'],
    },
    {
      expected: ['s.toUpperCase() -> s.toLowerCase()'],
      code: "let a = s.toUpperCase().search('!') > 0",
    },
    {
      code: "if (s.toUpperCase().includes('!', 2)) go()",
      expected: ['s.toUpperCase() -> s.toLowerCase()'],
    },
    {
      expected: [
        "s.toUpperCase().startsWith('!', 2) -> s.toUpperCase().endsWith('!', 2)",
        's.toUpperCase() -> s.toLowerCase()',
      ],
      code: "if (s.toUpperCase().startsWith('!', 2)) go()",
    },
    {
      expected: [
        "s.toUpperCase().endsWith('!', 3) -> s.toUpperCase().startsWith('!', 3)",
        's.toUpperCase() -> s.toLowerCase()',
      ],
      code: "if (s.toUpperCase().endsWith('!', 3)) go()",
    },
  ])('keeps the case swap of $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [
        'declare function f(x: unknown): string',
        ...DECLARATIONS,
        code,
      ]),
    ).toStrictEqual(expected)
  })

  it.each([
    {
      expected: ['Math.min(1, 2) -> Math.max(1, 2)'],
      code: 'let a = Math.min(1, 2)',
    },
    {
      expected: ['(Math).floor(x) -> (Math).ceil(x)'],
      code: 'let a = (Math).floor(x)',
    },
    { code: 'let a = Math.max(1, 2); function Math() {}', expected: [] },
    { code: 'let a = numbers.max(1, 2)', expected: [] },
    { code: "let a = 'x'.every(f)", expected: [] },
    { code: 'let a = items.trim()', expected: [] },
    {
      code: 'class B extends A { f() { return super.slice(1) } }',
      expected: [],
    },
  ])('gates the receiver of $code', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [...DECLARATIONS, code]),
    ).toStrictEqual(expected)
  })

  it('swaps a method of another receiver with anyReceiver', () => {
    expect(
      listMutantTexts('method-call', ['let a = numbers.max(x, y)'], {
        mutators: { 'method-call': ['on', { anyReceiver: true }] },
      }),
    ).toStrictEqual(['numbers.max(x, y) -> numbers.min(x, y)'])
  })

  it.each([
    {
      expected: ['rows.filter((row) => row.name) -> rows'],
      code: 'let a = rows.filter((row) => row.name)',
    },
    { expected: ['s.slice(-1) -> s'], code: 'let a = s.slice(-1)' },
  ])('owns the removal that $code stands for', ({ expected, code }) => {
    expect(
      listMutantTexts('method-call', [code], { file: 'example.js' }),
    ).toStrictEqual(expected)
  })

  it.each<[string, string[]]>([
    [
      'declare let s: string; if (s.toUpperCase()) go()',
      ['s.toUpperCase() -> s.toLowerCase() (equivalent truth-keeping-swap)'],
    ],
    [
      'declare let s: string; n = s.padStart(8).length',
      ['s.padStart(8) -> s.padEnd(8) (equivalent length-keeping-swap)'],
    ],
    [
      'declare let s: string; e = s.slice(0)',
      ['s.slice(0) -> s (equivalent identity-call)'],
    ],
    [
      'interface Q { filter(f: unknown): Q }; declare let q: Q; q.filter(f)',
      ['q.filter(f) -> q (noise receiver-type)'],
    ],
    [
      'm = foo.max(1, 2)',
      ['foo.max(1, 2) -> foo.min(1, 2) (noise receiver-type)'],
    ],
    [
      "declare let s: string; if (s.toLowerCase() === 'yes') go()",
      ['s.toLowerCase() -> s.toUpperCase() (owned O17)'],
    ],
    [
      'class A extends B { m() { return super.trim() } }',
      ['super.trim() -> super (invalid invalid-target)'],
    ],
    ['delete s?.trim().x', ['s?.trim().x -> s?.x (invalid invalid-target)']],
    ['declare let s: string; use(s.trim())', []],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('method-call', source)).toStrictEqual(expected)
  })
})
