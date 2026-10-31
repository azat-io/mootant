import { describe, expect, it } from 'vitest'

import type { MutatorSetup } from '../../helpers/generate-candidates'

import { generateCandidates } from '../../helpers/generate-candidates'
import { generateMutants } from '../../helpers/generate-mutants'
import { formatMutant } from '../../helpers/format-mutant'
import { listSkipped } from '../../helpers/list-skipped'
import { runMutator } from '../../helpers/run-mutator'

/**
 * Declarations of the catalog examples.
 */
const DECLARATIONS = [
  'interface User { name: string }',
  'interface Data { items: { title: string }[] }',
  'type MaybeUser = User | null',
].join('\n')

describe('optionalChaining', () => {
  it.each<{ expected: string[]; source: string }>([
    {
      source: 'function f(user: User | undefined) { x = user?.name }',
      expected: ['user?.name -> user.name'],
    },
    {
      source: "function f(user: User | undefined) { x = user?.['key'] }",
      expected: ["user?.['key'] -> user['key']"],
    },
    {
      source: 'function f(callback?: () => void) { callback?.() }',
      expected: ['callback?.() -> callback()'],
    },
    {
      source: 'function f(maybe: MaybeUser) { x = maybe?.name }',
      expected: ['maybe?.name -> maybe.name'],
    },
    {
      source:
        'function f<T extends User | undefined>(generic: T) { x = generic?.name }',
      expected: ['generic?.name -> generic.name'],
    },
    {
      source: 'function f(list: string[]) { x = list?.length }',
      expected: [],
    },
    {
      source: 'function f(user: User) { x = user?.name }',
      expected: [],
    },
    {
      source: 'x = 1?.toString()',
      expected: [],
    },
    {
      expected: [
        'data?.items?.[0]?.title -> data.items?.[0]?.title',
        'data?.items?.[0]?.title -> data?.items[0]?.title',
        'data?.items?.[0]?.title -> data?.items?.[0].title',
      ],
      source:
        'function f(data: Data | undefined) { x = data?.items?.[0]?.title }',
    },
    {
      expected: ['value?.trim().toLowerCase() -> value.trim().toLowerCase()'],
      source: 'x = value?.trim().toLowerCase()',
    },
  ])('mutates $source as in the catalog', ({ expected, source }) => {
    expect(
      runMutator('optional-chaining', [DECLARATIONS, source].join('\n')).map(
        formatMutant,
      ),
    ).toStrictEqual(expected)
  })

  it('removes a link whose object has an imported type, which may be nullable', () => {
    let source = [
      "import type { User } from './user'",
      'function f(user: User) {',
      '  x = user?.name',
      '}',
    ].join('\n')

    expect(
      runMutator('optional-chaining', source).map(formatMutant),
    ).toStrictEqual(['user?.name -> user.name'])
  })

  it.each<{ expected: string[]; source: string }>([
    {
      expected: ['a?.b!.c?.d -> a.b!.c?.d', 'a?.b!.c?.d -> a?.b!.c.d'],
      source: 'x = a?.b!.c?.d',
    },
    {
      expected: ['(a)?.b -> (a).b'],
      source: 'x = (a)?.b',
    },
    {
      expected: ['a /* c */ ?.b -> a /* c */ .b'],
      source: 'x = a /* c */ ?.b',
    },
    {
      expected: ['f?.<string>(a) -> f<string>(a)'],
      source: 'x = f?.<string>(a)',
    },
    {
      expected: ['a?.[b?.c] -> a[b?.c]', 'b?.c -> b.c'],
      source: 'x = a?.[b?.c]',
    },
    {
      expected: ['(a?.b)?.c -> (a?.b).c', 'a?.b -> a.b'],
      source: 'x = (a?.b)?.c',
    },
    {
      source: 'class A { f() { return this?.x } }',
      expected: [],
    },
  ])('handles $source', ({ expected, source }) => {
    expect(
      runMutator('optional-chaining', source).map(formatMutant),
    ).toStrictEqual(expected)
  })

  it.each([
    ['delete a?.b'],
    ['delete obj?.[key]'],
    ['function f(o) { delete o?.cache[key] }'],
    ['(a?.b)()'],
  ])('replaces no chain the switch cannot wrap in %s', source => {
    expect(
      runMutator('optional-chaining', source, { file: 'example.js' }),
    ).toStrictEqual([])
  })

  it.each<{ setup: MutatorSetup }>([
    {
      setup: {
        mutators: { 'optional-chaining': ['on', { nonNullable: true }] },
      },
    },
    { setup: { preset: 'strict' } },
  ])('replaces links of non-nullable objects with $setup', ({ setup }) => {
    let source = [
      'function f(list: string[]) {',
      '  x = list?.length',
      '  y = 1?.toString()',
      '}',
    ].join('\n')

    expect(
      runMutator('optional-chaining', source, setup).map(formatMutant),
    ).toStrictEqual([
      'list?.length -> list.length',
      '1?.toString() -> 1 .toString()',
    ])
  })

  it('comes before the statement removal of the same range', () => {
    let mutants = generateMutants('callback?.()')

    expect(mutants).toMatchObject([
      { mutator: 'optional-chaining', replacement: 'callback()', start: 0 },
      { mutator: 'statement-removal', replacement: ';', start: 0 },
    ])
    expect(mutants.map(mutant => mutant.end)).toStrictEqual([12, 12])
  })

  it.each<[string, string[]]>([
    [
      'declare let ok: { name: string }; use(ok?.name)',
      ['ok?.name -> ok.name (equivalent non-nullable)'],
    ],
    ['delete user?.name', ['user?.name -> user.name (invalid invalid-target)']],
    ['use(user?.name)', []],
  ])('lists the skipped mutants of %s', (source, expected) => {
    expect(listSkipped('optional-chaining', source)).toStrictEqual(expected)
  })

  it.each<{ setup: MutatorSetup }>([
    { setup: {} },
    {
      setup: {
        mutators: { 'optional-chaining': ['on', { nonNullable: true }] },
      },
    },
    { setup: { preset: 'strict' } },
  ])(
    'keeps the links after the groups of a regex match with $setup',
    ({ setup }) => {
      let source = [
        'function key(text: string) {',
        '  let match = text.match(/(?<key>[^:]+):/u)',
        "  return match?.groups?.['key']?.trim()",
        '}',
      ].join('\n')

      expect(
        runMutator('optional-chaining', source, setup).map(formatMutant),
      ).toStrictEqual([
        "match?.groups?.['key']?.trim() -> match.groups?.['key']?.trim()",
      ])
      expect(listSkipped('optional-chaining', source, setup)).toStrictEqual([
        "match?.groups?.['key']?.trim() -> match?.groups['key']?.trim() (equivalent named-groups)",
        "match?.groups?.['key']?.trim() -> match?.groups?.['key'].trim() (equivalent named-groups)",
      ])
    },
  )

  it.each<{ expected: string[]; source: string }>([
    {
      expected: [
        "/(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() -> /(?:x(?<tail>y))?z/u.exec(text).groups?.['tail']?.trim()",
        "/(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() -> /(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail'].trim()",
      ],
      source:
        "function tail(text: string) { return /(?:x(?<tail>y))?z/u.exec(text)?.groups?.['tail']?.trim() }",
    },
    {
      expected: [
        String.raw`text.match(/(?<word>\w+)/gu)?.groups?.['word'] -> text.match(/(?<word>\w+)/gu).groups?.['word']`,
        String.raw`text.match(/(?<word>\w+)/gu)?.groups?.['word'] -> text.match(/(?<word>\w+)/gu)?.groups['word']`,
      ],
      source: String.raw`function word(text: string) { return text.match(/(?<word>\w+)/gu)?.groups?.['word'] }`,
    },
  ])(
    'replaces the links that a match may leave nullish in $source',
    ({ expected, source }) => {
      expect(
        runMutator('optional-chaining', source).map(formatMutant),
      ).toStrictEqual(expected)
    },
  )

  it.each<{ skipped: string[]; source: string; kept: string[] }>([
    {
      source: 'while (cursor) { cursor = page?.next }',
      kept: ['page?.next -> page.next'],
      skipped: [],
    },
    {
      source: 'while (cursor) { try { cursor = page?.next } catch {} }',
      skipped: ['page?.next -> page.next (timeout loop-advance)'],
      kept: [],
    },
    {
      skipped: [
        "eval?.('cursor')?.next -> eval('cursor')?.next (timeout loop-advance)",
      ],
      source: "while (cursor) { cursor = eval?.('cursor')?.next }",
      kept: ["eval?.('cursor')?.next -> eval?.('cursor').next"],
    },
    {
      skipped: [
        "(eval as any)?.('cursor') -> (eval as any)('cursor') (timeout loop-advance)",
      ],
      source: "while (cursor) { cursor = (eval as any)?.('cursor') }",
      kept: [],
    },
    {
      kept: ["globalThis.eval?.('cursor') -> globalThis.eval('cursor')"],
      source: "while (cursor) { cursor = globalThis.eval?.('cursor') }",
      skipped: [],
    },
    {
      source:
        'async function walk(next) { let cursor = true; while (cursor) { cursor = next?.(await new Promise(() => {})) } }',
      skipped: [
        'next?.(await new Promise(() => {})) -> next(await new Promise(() => {})) (timeout loop-advance)',
      ],
      kept: [],
    },
    {
      source:
        'async function walk(map) { let cursor = true; while (cursor) { cursor = map?.[await key()] } }',
      skipped: [
        'map?.[await key()] -> map[await key()] (timeout loop-advance)',
      ],
      kept: [],
    },
    {
      source:
        'function* walk(next) { let cursor = true; while (cursor) { cursor = next?.(yield) } }',
      skipped: ['next?.(yield) -> next(yield) (timeout loop-advance)'],
      kept: [],
    },
    {
      skipped: ['next?.(...items) -> next(...items) (timeout loop-advance)'],
      source: 'while (cursor) { cursor = next?.(...items) }',
      kept: [],
    },
    {
      source: 'while (cursor) { cursor = next?.(() => load()) }',
      kept: ['next?.(() => load()) -> next(() => load())'],
      skipped: [],
    },
    {
      source: 'while (cursor) { cursor = queue?.shift(load()) }',
      kept: ['queue?.shift(load()) -> queue.shift(load())'],
      skipped: [],
    },
    {
      source: 'while (cursor) { cursor = next?.(cursor) }',
      kept: ['next?.(cursor) -> next(cursor)'],
      skipped: [],
    },
    {
      source: 'while (cursor) { cursor = map?.[cursor] }',
      kept: ['map?.[cursor] -> map[cursor]'],
      skipped: [],
    },
    {
      skipped: [
        'next?.(import(resolveName())) -> next(import(resolveName())) (timeout loop-advance)',
      ],
      source: 'while (cursor) { cursor = next?.(import(resolveName())) }',
      kept: [],
    },
    {
      kept: ["next?.(import('./page.js')) -> next(import('./page.js'))"],
      source: "while (cursor) { cursor = next?.(import('./page.js')) }",
      skipped: [],
    },
    {
      skipped: [
        'next?.(class { static { for (;;) {} } }) -> next(class { static { for (;;) {} } }) (timeout loop-advance)',
      ],
      source:
        'while (cursor) { cursor = next?.(class { static { for (;;) {} } }) }',
      kept: [],
    },
    {
      skipped: [
        'next?.([cursor] = pages) -> next([cursor] = pages) (timeout loop-advance)',
      ],
      source: 'while (cursor) { cursor = next?.([cursor] = pages) }',
      kept: [],
    },
    {
      source: 'while (cursor) { cursor = next?.(cursor as Page) }',
      kept: ['next?.(cursor as Page) -> next(cursor as Page)'],
      skipped: [],
    },
  ])(
    'skips a removed ?. that advances a loop only where it may keep the loop running in $source',
    ({ skipped, source, kept }) => {
      expect(
        runMutator('optional-chaining', source).map(formatMutant),
      ).toStrictEqual(kept)
      expect(listSkipped('optional-chaining', source)).toStrictEqual(skipped)
    },
  )

  it('skips a removed ?. that advances a loop when its arguments hold JSX', () => {
    let source = 'while (cursor) { cursor = next?.(<Page />) }'
    let setup = { file: 'example.tsx' }

    expect(
      runMutator('optional-chaining', source, setup).map(formatMutant),
    ).toStrictEqual([])
    expect(listSkipped('optional-chaining', source, setup)).toStrictEqual([
      'next?.(<Page />) -> next(<Page />) (timeout loop-advance)',
    ])
  })

  it('keeps every removed ?. that advances a loop with the timeouts setting', () => {
    let source = [
      'while (cursor) {',
      "  cursor = eval?.('cursor')",
      '  try { cursor = page?.next } catch {}',
      '}',
    ].join('\n')

    expect(
      runMutator('optional-chaining', source, {
        settings: { timeouts: true },
      }).map(formatMutant),
    ).toStrictEqual([
      "eval?.('cursor') -> eval('cursor')",
      'page?.next -> page.next',
    ])
  })

  it.each<[string, string]>([
    [
      'while (cursor) { try { cursor = page?.next } catch {} }',
      'a try inside the loop may catch its TypeError, so it may keep the loop running forever',
    ],
    [
      "while (cursor) { cursor = eval?.('cursor') }",
      'without ?. the eval call is direct and sees local variables, so it may keep the loop running forever',
    ],
    [
      'async function walk(next) { while (cursor) { cursor = next?.(await load()) } }',
      'without ?. the arguments are computed even for a nullish callee and may never finish, so it may keep the loop running forever',
    ],
    [
      'while (cursor) { cursor = map?.[key()] }',
      'without ?. the key is computed even for a nullish object and may never finish, so it may keep the loop running forever',
    ],
  ])('explains the skipped removal in %s', (source, reason) => {
    let { skipped } = generateCandidates(source)

    expect(
      skipped
        .filter(candidate => candidate.mutator === 'optional-chaining')
        .map(candidate => [candidate.rule, candidate.reason]),
    ).toStrictEqual([['loop-advance', reason]])
  })
})
